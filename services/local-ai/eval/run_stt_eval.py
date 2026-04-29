"""
STT eval harness for sorisori-local-ai (/transcribe).

Goal:
- Evaluate source transcription quality (EN/JA) before translation quality.
- Track keyword retention % as primary metric.

Corpus format (JSON array):
[
  {
    "id": "en_001",
    "lang": "en",
    "audio_path": "services/local-ai/eval/audio/en_001.wav",
    "expected_text": "Hi, how are you? Do you like chocolate?",
    "keywords": ["hi", "how", "you", "like", "chocolate"]
  }
]
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import wave
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Optional

import numpy as np


DEFAULT_URL = os.environ.get("LOCAL_AI_URL", "http://127.0.0.1:8789")
DEFAULT_CORPUS = os.path.join(os.path.dirname(__file__), "stt_corpus.json")
TARGET_SR = 24_000

# Very small stopword list just to avoid useless EN auto-keywords when explicit
# keywords are not provided.
EN_STOP = {
    "a", "an", "the", "is", "am", "are", "to", "of", "and", "or", "for", "in", "on",
    "at", "this", "that", "it", "i", "you", "we", "they", "he", "she", "be", "was", "were",
    "do", "does", "did", "have", "has", "had", "can", "could", "will", "would", "should",
}


@dataclass
class CaseResult:
    case_id: str
    lang: str
    source_type: str
    ms: int
    expected: str
    transcript: str
    keywords: list[str]
    keyword_hit: int
    keyword_total: int
    keyword_retention: float
    text_similarity: float
    error: Optional[str] = None


def _load_cases_from_corpus(path: str) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]

    if isinstance(raw, dict):
        cases = raw.get("cases")
        if isinstance(cases, list):
            return [item for item in cases if isinstance(item, dict)]

    raise ValueError("Corpus JSON must be an array of cases or an object with 'cases' array.")


def _normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize_en(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", _normalize_text(text).lower())


def _ensure_keywords(case: dict[str, Any]) -> list[str]:
    raw = case.get("keywords")
    if isinstance(raw, list):
        out = [_normalize_text(str(x)).lower() for x in raw if _normalize_text(str(x))]
        if out:
            return out

    # Fallback: EN only auto extraction. JA should provide explicit keywords.
    lang = str(case.get("lang", "")).lower()
    expected = _normalize_text(str(case.get("expected_text", "")))
    if lang != "en":
        return []

    keys: list[str] = []
    for tok in _tokenize_en(expected):
        if len(tok) <= 2:
            continue
        if tok in EN_STOP:
            continue
        if tok not in keys:
            keys.append(tok)
    return keys


def _keyword_retention(lang: str, transcript: str, keywords: list[str]) -> tuple[int, int, float]:
    if not keywords:
        return 0, 0, 0.0

    lang = lang.lower()
    normalized = _normalize_text(transcript)

    hit = 0
    if lang == "en":
        token_set = set(_tokenize_en(normalized))
        for kw in keywords:
            if kw.lower() in token_set:
                hit += 1
    else:
        # JA: substring match on normalized text; keyword list should contain meaningful words.
        lowered = normalized.lower()
        for kw in keywords:
            if kw.lower() in lowered:
                hit += 1

    total = len(keywords)
    return hit, total, (100.0 * hit / total if total > 0 else 0.0)


def _text_similarity(a: str, b: str) -> float:
    aa = _normalize_text(a)
    bb = _normalize_text(b)
    if not aa and not bb:
        return 100.0
    return 100.0 * SequenceMatcher(None, aa, bb).ratio()


def _read_wav_as_pcm16_mono_24k(path: str) -> bytes:
    with wave.open(path, "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        sample_rate = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sampwidth == 2:
        arr = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 1:
        # unsigned 8-bit PCM
        arr = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    elif sampwidth == 4:
        # treat as signed 32-bit PCM
        arr = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise ValueError(f"Unsupported WAV sample width: {sampwidth} bytes")

    if n_channels > 1:
        arr = arr.reshape(-1, n_channels).mean(axis=1)

    if sample_rate != TARGET_SR and arr.size > 0:
        old_x = np.linspace(0.0, 1.0, num=arr.size, endpoint=False)
        new_len = max(1, int(round(arr.size * TARGET_SR / sample_rate)))
        new_x = np.linspace(0.0, 1.0, num=new_len, endpoint=False)
        arr = np.interp(new_x, old_x, arr).astype(np.float32)

    pcm16 = np.clip(arr, -1.0, 1.0)
    pcm16 = (pcm16 * 32767.0).astype(np.int16)
    return pcm16.tobytes()


def _read_any_audio_as_pcm16_mono_24k(path: str) -> bytes:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".wav":
        return _read_wav_as_pcm16_mono_24k(path)

    # Optional fallback for mp3/m4a/flac/ogg, etc.
    try:
        import av  # type: ignore[import-untyped]
    except Exception as exc:
        raise RuntimeError(
            f"Unsupported audio format for {path!r}; install PyAV support or use WAV. ({exc})"
        ) from exc

    chunks: list[np.ndarray] = []
    with av.open(path) as container:
        audio_stream = next((s for s in container.streams if s.type == "audio"), None)
        if audio_stream is None:
            raise ValueError(f"No audio stream found in {path}")
        resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=TARGET_SR)
        for frame in container.decode(audio_stream):
            out = resampler.resample(frame)
            frames = out if isinstance(out, list) else [out]
            for frm in frames:
                if frm is None:
                    continue
                arr = frm.to_ndarray()
                if arr.ndim == 2:
                    arr = arr[0]
                chunks.append(arr.astype(np.int16, copy=False))

    if not chunks:
        raise ValueError(f"No decoded samples in {path}")
    return np.concatenate(chunks).astype(np.int16, copy=False).tobytes()


def _post_transcribe(base_url: str, pcm16_mono_24k: bytes, lang: str, timeout_s: float) -> str:
    url = f"{base_url.rstrip('/')}/transcribe"
    payload = {
        "audio_base64": base64.b64encode(pcm16_mono_24k).decode("ascii"),
        "language": lang,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        body = resp.read().decode("utf-8")
    parsed = json.loads(body)
    return _normalize_text(str(parsed.get("transcript", "")))


def _print_result(r: CaseResult) -> None:
    status = "OK" if not r.error else f"ERR({r.error})"
    _safe_print(
        f"{r.case_id:16} {r.lang:>2}/{r.source_type:<13} {r.ms:5}ms "
        f"KW {r.keyword_hit:2}/{r.keyword_total:<2} {r.keyword_retention:6.1f}% "
        f"SIM {r.text_similarity:6.1f}%  {status}"
    )
    _safe_print(f"  exp: {r.expected}")
    _safe_print(f"  out: {r.transcript}")


def _safe_print(text: str) -> None:
    try:
        print(text)
        return
    except UnicodeEncodeError:
        pass

    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    fallback = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(fallback)


def run(
    corpus_path: str,
    base_url: str,
    timeout_s: float,
    filter_lang: Optional[str],
    filter_source_type: Optional[str],
    threshold_en: float,
    threshold_ja: float,
    save_path: Optional[str],
    quiet: bool,
) -> int:
    if not os.path.exists(corpus_path):
        raise FileNotFoundError(f"Corpus not found: {corpus_path}")

    corpus = _load_cases_from_corpus(corpus_path)
    corpus_dir = os.path.dirname(os.path.abspath(corpus_path))

    rows: list[CaseResult] = []

    for item in corpus:
        case_id = str(item.get("id", "")).strip() or "(no-id)"
        lang = str(item.get("lang", "")).strip().lower()
        source_type = str(item.get("source_type", "")).strip().lower() or "unknown"
        if filter_lang and lang != filter_lang:
            continue
        if filter_source_type and source_type != filter_source_type:
            continue
        if lang not in {"en", "ja"}:
            continue

        audio_path = str(item.get("audio_path", "")).strip()
        expected = _normalize_text(str(item.get("expected_text", "")))
        keywords = _ensure_keywords(item)

        if not os.path.isabs(audio_path):
            audio_path = os.path.abspath(os.path.join(corpus_dir, audio_path))

        started = time.perf_counter()
        try:
            pcm16 = _read_any_audio_as_pcm16_mono_24k(audio_path)
            transcript = _post_transcribe(base_url, pcm16, lang, timeout_s=timeout_s)
            hit, total, retention = _keyword_retention(lang, transcript, keywords)
            sim = _text_similarity(expected, transcript)
            ms = int((time.perf_counter() - started) * 1000)
            row = CaseResult(
                case_id=case_id,
                lang=lang,
                source_type=source_type,
                ms=ms,
                expected=expected,
                transcript=transcript,
                keywords=keywords,
                keyword_hit=hit,
                keyword_total=total,
                keyword_retention=retention,
                text_similarity=sim,
            )
        except Exception as exc:
            ms = int((time.perf_counter() - started) * 1000)
            row = CaseResult(
                case_id=case_id,
                lang=lang,
                source_type=source_type,
                ms=ms,
                expected=expected,
                transcript="",
                keywords=keywords,
                keyword_hit=0,
                keyword_total=len(keywords),
                keyword_retention=0.0,
                text_similarity=0.0,
                error=str(exc),
            )

        rows.append(row)
        if not quiet:
            _print_result(row)

    if not rows:
        print("No cases evaluated. Check corpus path/lang/audio files.")
        return 2

    # Aggregate (weighted by keyword count)
    total_hit = sum(r.keyword_hit for r in rows)
    total_kw = sum(r.keyword_total for r in rows)
    avg_ret = (100.0 * total_hit / total_kw) if total_kw > 0 else 0.0
    avg_sim = sum(r.text_similarity for r in rows) / len(rows)
    error_rows = [r for r in rows if r.error]

    # Per language
    by_lang: dict[str, list[CaseResult]] = {"en": [], "ja": []}
    by_source_type: dict[str, list[CaseResult]] = {}
    for r in rows:
        by_lang.setdefault(r.lang, []).append(r)
        by_source_type.setdefault(r.source_type or "unknown", []).append(r)

    lang_metrics: dict[str, dict[str, float | int]] = {}

    print("\n=== STT Eval Summary ===")
    print(f"cases={len(rows)}  weighted_keyword_retention={avg_ret:.2f}%  avg_text_similarity={avg_sim:.2f}%")
    if error_rows:
        print(f"errors={len(error_rows)}")
        for row in error_rows[:5]:
            print(f"  - {row.case_id}: {row.error}")
    for lang, items in by_lang.items():
        if not items:
            continue
        lang_hit = sum(x.keyword_hit for x in items)
        lang_total = sum(x.keyword_total for x in items)
        lang_ret = (100.0 * lang_hit / lang_total) if lang_total > 0 else 0.0
        lang_sim = sum(x.text_similarity for x in items) / len(items)
        print(f"- {lang}: cases={len(items)} retention={lang_ret:.2f}% similarity={lang_sim:.2f}%")
        lang_metrics[lang] = {
            "cases": len(items),
            "keyword_hit": lang_hit,
            "keyword_total": lang_total,
            "retention": lang_ret,
            "similarity": lang_sim,
        }

    print("- source_type:")
    for source_type, items in sorted(by_source_type.items()):
        src_hit = sum(x.keyword_hit for x in items)
        src_total = sum(x.keyword_total for x in items)
        src_ret = (100.0 * src_hit / src_total) if src_total > 0 else 0.0
        src_sim = sum(x.text_similarity for x in items) / len(items)
        print(f"  - {source_type}: cases={len(items)} retention={src_ret:.2f}% similarity={src_sim:.2f}%")

    if error_rows and len(error_rows) == len(rows):
        print("RESULT: INVALID (all cases errored)")
        return 3

    en_ret = float(lang_metrics.get("en", {}).get("retention", 0.0))
    ja_ret = float(lang_metrics.get("ja", {}).get("retention", 0.0))
    pass_en = en_ret >= threshold_en if int(lang_metrics.get("en", {}).get("cases", 0)) > 0 else False
    pass_ja = ja_ret >= threshold_ja if int(lang_metrics.get("ja", {}).get("cases", 0)) > 0 else False

    result_status = "PASS" if (pass_en and pass_ja) else "FAIL"
    print(
        f"gate: EN {en_ret:.2f}% (>= {threshold_en:.2f}) | "
        f"JA {ja_ret:.2f}% (>= {threshold_ja:.2f})"
    )
    print(f"RESULT: {result_status}")

    if save_path:
        payload = {
            "status": result_status,
            "thresholds": {"en": threshold_en, "ja": threshold_ja},
            "summary": {
                "cases": len(rows),
                "weighted_keyword_retention": avg_ret,
                "avg_text_similarity": avg_sim,
                "errors": len(error_rows),
            },
            "by_lang": lang_metrics,
            "by_source_type": {
                k: {
                    "cases": len(v),
                    "keyword_hit": sum(x.keyword_hit for x in v),
                    "keyword_total": sum(x.keyword_total for x in v),
                    "retention": (100.0 * sum(x.keyword_hit for x in v) / sum(x.keyword_total for x in v))
                    if sum(x.keyword_total for x in v) > 0
                    else 0.0,
                    "similarity": sum(x.text_similarity for x in v) / len(v),
                }
                for k, v in by_source_type.items()
            },
            "rows": [
                {
                    "id": r.case_id,
                    "lang": r.lang,
                    "source_type": r.source_type,
                    "ms": r.ms,
                    "expected": r.expected,
                    "transcript": r.transcript,
                    "keywords": r.keywords,
                    "keyword_hit": r.keyword_hit,
                    "keyword_total": r.keyword_total,
                    "keyword_retention": r.keyword_retention,
                    "text_similarity": r.text_similarity,
                    "error": r.error,
                }
                for r in rows
            ],
        }
        os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"saved report: {save_path}")

    return 0 if result_status == "PASS" else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="STT keyword-retention evaluator for sorisori-local-ai.")
    parser.add_argument("--corpus", default=DEFAULT_CORPUS, help="Path to STT corpus JSON")
    parser.add_argument("--url", default=DEFAULT_URL, help="local-ai base URL (default: http://127.0.0.1:8789)")
    parser.add_argument("--timeout", type=float, default=60.0, help="HTTP timeout seconds per case")
    parser.add_argument("--filter-lang", choices=["en", "ja"], default=None, help="Evaluate only one language")
    parser.add_argument(
        "--filter-source-type",
        choices=["synthetic", "human_external", "music_mixed", "unknown"],
        default=None,
        help="Evaluate only one source_type",
    )
    parser.add_argument("--threshold-en", type=float, default=85.0, help="Pass threshold for EN keyword retention")
    parser.add_argument("--threshold-ja", type=float, default=75.0, help="Pass threshold for JA keyword retention")
    parser.add_argument("--save", default=None, help="Optional output JSON report path")
    parser.add_argument("--quiet", action="store_true", help="Print summary only")
    args = parser.parse_args()

    code = run(
        corpus_path=args.corpus,
        base_url=args.url,
        timeout_s=args.timeout,
        filter_lang=args.filter_lang,
        filter_source_type=args.filter_source_type,
        threshold_en=args.threshold_en,
        threshold_ja=args.threshold_ja,
        save_path=args.save,
        quiet=args.quiet,
    )
    raise SystemExit(code)


if __name__ == "__main__":
    main()
