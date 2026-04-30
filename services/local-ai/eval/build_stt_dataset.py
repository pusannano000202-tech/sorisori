"""
Build EN/JA STT corpus for keyword-retention evaluation.

Target profile (per language):
- synthetic: 30
- human_external: 40
- music_mixed: 30

This script supports:
1) Synthetic generation via edge-tts.
2) External ingestion from user-managed manifests (local file or URL).
3) Audio normalization to PCM16 mono 24k WAV clips.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import unicodedata
import urllib.parse
import urllib.request
import wave
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

TARGET_SR = 24_000

SOURCE_SYNTHETIC = "synthetic"
SOURCE_HUMAN_EXTERNAL = "human_external"
SOURCE_MUSIC_MIXED = "music_mixed"
SUPPORTED_SOURCE_TYPES = {SOURCE_SYNTHETIC, SOURCE_HUMAN_EXTERNAL, SOURCE_MUSIC_MIXED}

EN_STOP = {
    "a", "an", "the", "is", "am", "are", "to", "of", "and", "or", "for", "in", "on",
    "at", "this", "that", "it", "i", "you", "we", "they", "he", "she", "be", "was", "were",
    "do", "does", "did", "have", "has", "had", "can", "could", "will", "would", "should",
}

DEFAULT_SYNTHETIC_COUNTS = {"en": 30, "ja": 30}
DEFAULT_HUMAN_COUNTS = {"en": 40, "ja": 40}
DEFAULT_MUSIC_COUNTS = {"en": 30, "ja": 30}


EN_SYNTHETIC_TEXTS = [
    "Hi, how are you?",
    "Do you like chocolate?",
    "Where can I catch the shuttle?",
    "Long time no see.",
    "Please go to that stop over there.",
    "I am waiting near the station.",
    "Can you speak a little slower?",
    "Let's meet after lunch.",
    "This is easier than I expected.",
    "I need to charge my laptop.",
    "The meeting starts in ten minutes.",
    "Could you repeat that last part?",
    "I forgot to bring my umbrella.",
    "Please turn down the volume a bit.",
    "The weather is getting colder today.",
    "I will call you after work.",
    "We should check the schedule again.",
    "That sounds like a great idea.",
    "I cannot hear you very well.",
    "Please send me the final file.",
    "The train is delayed by five minutes.",
    "I have never tried this before.",
    "Let's take a short break now.",
    "Can we move this to tomorrow?",
    "I think this will work.",
    "Please wait at the front desk.",
    "The subtitles are slightly delayed.",
    "He speaks very clearly and slowly.",
    "This part is hard to understand.",
    "Could you explain it one more time?",
    "I will be back in a moment.",
    "Please keep the door open.",
    "The internet is unstable right now.",
    "We need a cleaner audio sample.",
    "Try using headphones for better sound.",
    "This sentence includes a travel phrase.",
    "Do not worry, we can fix it.",
    "The app is almost ready.",
    "Please start the capture again.",
    "I can hear background music clearly.",
]


JA_SYNTHETIC_TEXTS = [
    "こんにちは。元気ですか。",
    "チョコレートは好きですか。",
    "シャトルバスはどこで乗れますか。",
    "お久しぶりです。",
    "あの停留所まで行ってください。",
    "駅の近くで待っています。",
    "もう少しゆっくり話してください。",
    "昼ごはんの後で会いましょう。",
    "思ったより簡単でした。",
    "ノートパソコンを充電したいです。",
    "会議はあと十分で始まります。",
    "最後の部分をもう一度言ってください。",
    "傘を持ってくるのを忘れました。",
    "音量を少し下げてください。",
    "今日はだんだん寒くなってきました。",
    "仕事の後で電話します。",
    "予定をもう一度確認しましょう。",
    "それはいい考えですね。",
    "あなたの声がよく聞こえません。",
    "最終ファイルを送ってください。",
    "電車は五分遅れています。",
    "私はこれを試したことがありません。",
    "ここで少し休みましょう。",
    "これを明日に回せますか。",
    "これはうまくいくと思います。",
    "受付の前で待っていてください。",
    "字幕が少し遅れています。",
    "彼ははっきりゆっくり話します。",
    "この部分は理解しにくいです。",
    "もう一度説明してもらえますか。",
    "すぐに戻ります。",
    "ドアを開けたままにしてください。",
    "今はインターネットが不安定です。",
    "もっときれいな音声サンプルが必要です。",
    "ヘッドホンを使うと音が良くなります。",
    "この文には移動の表現が含まれています。",
    "心配しないでください。直せます。",
    "アプリはもうすぐ準備できます。",
    "もう一度キャプチャを始めてください。",
    "背景の音楽がはっきり聞こえます。",
]


@dataclass
class ExternalEntry:
    id: str
    lang: str
    source_type: str
    expected_text: str
    keywords: list[str]
    license_note: str
    source_url: str
    local_path: str
    start_sec: float
    duration_sec: float


def _normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize_en(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", _normalize_text(text).lower())


def _tokenize_ja_like(text: str) -> list[str]:
    # Keep contiguous JP/CJK blocks. This is simple but stable for keyword matching.
    tokens = re.findall(r"[ぁ-んァ-ン一-龯ー]+", _normalize_text(text))
    dedup: list[str] = []
    for tok in tokens:
        if tok and tok not in dedup:
            dedup.append(tok)
    return dedup


def _auto_keywords(lang: str, expected_text: str) -> list[str]:
    expected = _normalize_text(expected_text)
    if lang == "en":
        out: list[str] = []
        for tok in _tokenize_en(expected):
            if len(tok) <= 2 or tok in EN_STOP:
                continue
            if "'" in tok:
                continue
            if tok not in out:
                out.append(tok)
        return out[:4]

    if lang == "ja":
        kanji = re.findall(r"[一-龯]{2,4}", expected)
        kana = re.findall(r"[ァ-ン]{3,6}", expected)
        out: list[str] = []
        for tok in kanji + kana:
            if tok not in out:
                out.append(tok)
        return out[:3]

    return []


def _write_wav_pcm16_mono(path: Path, pcm16: np.ndarray, sample_rate: int = TARGET_SR) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm16 = np.asarray(pcm16, dtype=np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16.tobytes())


def _decode_audio_to_pcm16_mono_24k(path: Path) -> np.ndarray:
    try:
        import av  # type: ignore[import-untyped]
    except Exception as exc:
        raise RuntimeError("PyAV is required for external audio ingestion.") from exc

    chunks: list[np.ndarray] = []
    with av.open(str(path)) as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise ValueError(f"No audio stream found: {path}")
        resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=TARGET_SR)
        for frame in container.decode(stream):
            out = resampler.resample(frame)
            out_frames = out if isinstance(out, list) else [out]
            for frm in out_frames:
                if frm is None:
                    continue
                arr = frm.to_ndarray()
                if arr.ndim == 2:
                    arr = arr[0]
                chunks.append(arr.astype(np.int16, copy=False))

    if not chunks:
        raise ValueError(f"No decoded samples: {path}")
    return np.concatenate(chunks).astype(np.int16, copy=False)


def _clip_pcm16(samples: np.ndarray, start_sec: float, duration_sec: float) -> np.ndarray:
    if duration_sec <= 0:
        return samples
    start_idx = max(0, int(round(start_sec * TARGET_SR)))
    end_idx = start_idx + int(round(duration_sec * TARGET_SR))
    if start_idx >= len(samples):
        return np.array([], dtype=np.int16)
    return samples[start_idx:end_idx]


def _download_file(url: str, dst: Path) -> Path:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_size > 0:
        return dst
    with urllib.request.urlopen(url, timeout=120) as resp:
        data = resp.read()
    dst.write_bytes(data)
    return dst


def _resolve_external_source(entry: ExternalEntry, manifest_dir: Path, cache_dir: Path) -> Path:
    if entry.local_path:
        candidate = (manifest_dir / entry.local_path).resolve()
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"local_path missing for {entry.id}: {candidate}")

    if entry.source_url:
        parsed = urllib.parse.urlparse(entry.source_url)
        suffix = Path(parsed.path).suffix or ".bin"
        dst = cache_dir / f"{entry.id}{suffix}"
        return _download_file(entry.source_url, dst)

    raise ValueError(f"Entry {entry.id} must have either local_path or source_url.")


def _load_entries(path: Path) -> list[ExternalEntry]:
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        raw_entries = raw.get("entries", [])
    elif isinstance(raw, list):
        raw_entries = raw
    else:
        raw_entries = []

    out: list[ExternalEntry] = []
    for item in raw_entries:
        if not isinstance(item, dict):
            continue
        source_type = str(item.get("source_type", "")).strip().lower()
        if source_type not in SUPPORTED_SOURCE_TYPES - {SOURCE_SYNTHETIC}:
            continue
        lang = str(item.get("lang", "")).strip().lower()
        if lang not in {"en", "ja"}:
            continue
        expected = _normalize_text(str(item.get("expected_text", item.get("text", ""))))
        if not expected:
            continue
        raw_keywords = item.get("keywords")
        keywords = []
        if isinstance(raw_keywords, list):
            keywords = [_normalize_text(str(x)) for x in raw_keywords if _normalize_text(str(x))]
        if not keywords:
            keywords = _auto_keywords(lang, expected)
        out.append(
            ExternalEntry(
                id=str(item.get("id", "")).strip() or f"{source_type}_{lang}_{len(out)+1:03d}",
                lang=lang,
                source_type=source_type,
                expected_text=expected,
                keywords=keywords,
                license_note=str(item.get("license_note", "")).strip(),
                source_url=str(item.get("source_url", "")).strip(),
                local_path=str(item.get("local_path", "")).strip(),
                start_sec=float(item.get("start_sec", 0.0) or 0.0),
                duration_sec=float(item.get("duration_sec", 5.0) or 5.0),
            )
        )
    return out


async def _generate_synthetic_audio(
    out_path: Path,
    text: str,
    voice: str,
) -> None:
    try:
        import edge_tts  # type: ignore[import-untyped]
    except Exception as exc:
        raise RuntimeError("edge-tts is required for synthetic generation.") from exc

    out_path.parent.mkdir(parents=True, exist_ok=True)
    communicator = edge_tts.Communicate(text=text, voice=voice)
    await communicator.save(str(out_path))


def _to_case_dict(
    *,
    case_id: str,
    lang: str,
    source_type: str,
    audio_rel_path: str,
    expected_text: str,
    keywords: list[str],
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": case_id,
        "lang": lang,
        "source_type": source_type,
        "audio_path": audio_rel_path.replace("\\", "/"),
        "expected_text": expected_text,
        "keywords": keywords,
    }
    if meta:
        payload.update(meta)
    return payload


def _make_synthetic_plan(count: int, texts: list[str]) -> list[str]:
    if count <= len(texts):
        return texts[:count]
    # Reuse with deterministic shuffle-like stepping.
    out: list[str] = []
    for i in range(count):
        out.append(texts[i % len(texts)])
    return out


def build_dataset(
    *,
    corpus_path: Path,
    audio_root: Path,
    human_manifest: Path,
    music_manifest: Path,
    synthetic_counts: dict[str, int],
    human_counts: dict[str, int],
    music_counts: dict[str, int],
    voice_en: str,
    voice_ja: str,
    allow_partial: bool,
) -> dict[str, Any]:
    random.seed(42)
    corpus_dir = corpus_path.parent
    audio_root.mkdir(parents=True, exist_ok=True)

    cases: list[dict[str, Any]] = []
    counters = {
        "en": {SOURCE_SYNTHETIC: 0, SOURCE_HUMAN_EXTERNAL: 0, SOURCE_MUSIC_MIXED: 0},
        "ja": {SOURCE_SYNTHETIC: 0, SOURCE_HUMAN_EXTERNAL: 0, SOURCE_MUSIC_MIXED: 0},
    }

    # 1) Synthetic generation.
    synthetic_jobs: list[tuple[str, str, str, Path]] = []
    en_texts = _make_synthetic_plan(synthetic_counts["en"], EN_SYNTHETIC_TEXTS)
    ja_texts = _make_synthetic_plan(synthetic_counts["ja"], JA_SYNTHETIC_TEXTS)
    for idx, text in enumerate(en_texts, start=1):
        case_id = f"en_syn_{idx:03d}"
        rel = Path("audio") / "generated" / SOURCE_SYNTHETIC / "en" / f"{case_id}.mp3"
        abs_path = corpus_dir / rel
        synthetic_jobs.append((case_id, "en", text, abs_path))
    for idx, text in enumerate(ja_texts, start=1):
        case_id = f"ja_syn_{idx:03d}"
        rel = Path("audio") / "generated" / SOURCE_SYNTHETIC / "ja" / f"{case_id}.mp3"
        abs_path = corpus_dir / rel
        synthetic_jobs.append((case_id, "ja", text, abs_path))

    async def _run_synthetic_jobs() -> None:
        for case_id, lang, text, abs_path in synthetic_jobs:
            voice = voice_en if lang == "en" else voice_ja
            await _generate_synthetic_audio(abs_path, text, voice)
            keywords = _auto_keywords(lang, text)
            cases.append(
                _to_case_dict(
                    case_id=case_id,
                    lang=lang,
                    source_type=SOURCE_SYNTHETIC,
                    audio_rel_path=str(abs_path.relative_to(corpus_dir)),
                    expected_text=text,
                    keywords=keywords,
                )
            )
            counters[lang][SOURCE_SYNTHETIC] += 1

    asyncio.run(_run_synthetic_jobs())

    # 2) External ingestion (human + music).
    external_entries = _load_entries(human_manifest) + _load_entries(music_manifest)
    cache_dir = corpus_dir / "audio" / "raw-cache"
    for entry in external_entries:
        target_limit = (
            human_counts[entry.lang]
            if entry.source_type == SOURCE_HUMAN_EXTERNAL
            else music_counts[entry.lang]
        )
        if counters[entry.lang][entry.source_type] >= target_limit:
            continue

        src_audio = _resolve_external_source(entry, human_manifest.parent if entry.source_type == SOURCE_HUMAN_EXTERNAL else music_manifest.parent, cache_dir)
        decoded = _decode_audio_to_pcm16_mono_24k(src_audio)
        clipped = _clip_pcm16(decoded, entry.start_sec, entry.duration_sec)
        if clipped.size == 0:
            continue

        out_rel = (
            Path("audio")
            / "generated"
            / entry.source_type
            / entry.lang
            / f"{entry.id}.wav"
        )
        out_abs = corpus_dir / out_rel
        _write_wav_pcm16_mono(out_abs, clipped, TARGET_SR)

        cases.append(
            _to_case_dict(
                case_id=entry.id,
                lang=entry.lang,
                source_type=entry.source_type,
                audio_rel_path=str(out_rel),
                expected_text=entry.expected_text,
                keywords=entry.keywords,
                meta={
                    "license_note": entry.license_note,
                    "start_sec": entry.start_sec,
                    "duration_sec": entry.duration_sec,
                },
            )
        )
        counters[entry.lang][entry.source_type] += 1

    # Stable ordering for reproducibility.
    cases.sort(key=lambda x: (x["lang"], x["source_type"], x["id"]))

    targets = {
        "en": {
            SOURCE_SYNTHETIC: synthetic_counts["en"],
            SOURCE_HUMAN_EXTERNAL: human_counts["en"],
            SOURCE_MUSIC_MIXED: music_counts["en"],
        },
        "ja": {
            SOURCE_SYNTHETIC: synthetic_counts["ja"],
            SOURCE_HUMAN_EXTERNAL: human_counts["ja"],
            SOURCE_MUSIC_MIXED: music_counts["ja"],
        },
    }

    missing: list[str] = []
    for lang in ("en", "ja"):
        for source_type in (SOURCE_SYNTHETIC, SOURCE_HUMAN_EXTERNAL, SOURCE_MUSIC_MIXED):
            have = counters[lang][source_type]
            need = targets[lang][source_type]
            if have < need:
                missing.append(f"{lang}/{source_type}: {have}/{need}")

    payload = {
        "version": "2.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "description": "EN/JA STT corpus for keyword-retention gate.",
        "targets": targets,
        "counts": counters,
        "cases": cases,
    }
    corpus_path.parent.mkdir(parents=True, exist_ok=True)
    corpus_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if missing and not allow_partial:
        raise RuntimeError("Dataset build incomplete: " + ", ".join(missing))
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build EN/JA STT corpus from synthetic + external sources.")
    parser.add_argument("--corpus", default="services/local-ai/eval/stt_corpus.json")
    parser.add_argument("--audio-root", default="services/local-ai/eval/audio")
    parser.add_argument(
        "--human-manifest",
        default="services/local-ai/eval/sources/human_external_sources.json",
    )
    parser.add_argument(
        "--music-manifest",
        default="services/local-ai/eval/sources/music_sources.json",
    )
    parser.add_argument("--synthetic-en", type=int, default=30)
    parser.add_argument("--synthetic-ja", type=int, default=30)
    parser.add_argument("--human-en", type=int, default=40)
    parser.add_argument("--human-ja", type=int, default=40)
    parser.add_argument("--music-en", type=int, default=30)
    parser.add_argument("--music-ja", type=int, default=30)
    parser.add_argument("--voice-en", default="en-US-AriaNeural")
    parser.add_argument("--voice-ja", default="ja-JP-NanamiNeural")
    parser.add_argument("--allow-partial", action="store_true", help="Do not fail if target counts are missing")
    args = parser.parse_args()

    payload = build_dataset(
        corpus_path=Path(args.corpus).resolve(),
        audio_root=Path(args.audio_root).resolve(),
        human_manifest=Path(args.human_manifest).resolve(),
        music_manifest=Path(args.music_manifest).resolve(),
        synthetic_counts={"en": args.synthetic_en, "ja": args.synthetic_ja},
        human_counts={"en": args.human_en, "ja": args.human_ja},
        music_counts={"en": args.music_en, "ja": args.music_ja},
        voice_en=args.voice_en,
        voice_ja=args.voice_ja,
        allow_partial=args.allow_partial,
    )

    counts = payload.get("counts", {})
    print("Dataset build complete.")
    print(json.dumps(counts, ensure_ascii=False, indent=2))
    print(f"Corpus written to: {Path(args.corpus).resolve()}")


if __name__ == "__main__":
    main()
