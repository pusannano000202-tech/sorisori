"""
Auto-populate external manifests and raw audio files for STT evaluation.

Plan:
- Human external (EN/JA): pull public speech clips from HF datasets.
- Music mixed (EN/JA): mix selected speech clips with generated background music.

Outputs:
- services/local-ai/eval/sources/human_external_sources.json
- services/local-ai/eval/sources/music_sources.json
- services/local-ai/eval/sources/raw/en/human/*.wav
- services/local-ai/eval/sources/raw/en/music/*.wav
- services/local-ai/eval/sources/raw/ja/human/*.wav
- services/local-ai/eval/sources/raw/ja/music/*.wav
"""

from __future__ import annotations

import argparse
import io
import json
import math
import random
import re
import unicodedata
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from datasets import Audio, load_dataset

TARGET_SR = 24_000
EN_DURATION_SEC = 5.0
JA_DURATION_SEC = 10.0  # longer clips for formal Japanese sentences
TARGET_DURATION_SEC = EN_DURATION_SEC  # kept for music-mix compat
TARGET_SAMPLES = int(TARGET_SR * EN_DURATION_SEC)

EN_HUMAN_COUNT = 40
EN_MUSIC_COUNT = 30
JA_HUMAN_COUNT = 40
JA_MUSIC_COUNT = 30

EN_DATASET = "PolyAI/minds14"
EN_CONFIG = "en-US"
JA_DATASET = "shunyalabs/japanese-speech-dataset"
JA_CONFIG: str | None = None


@dataclass
class SpeechSample:
    lang: str
    transcript: str
    pcm16: np.ndarray
    source_id: str


def _normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _is_valid_en_text(text: str) -> bool:
    if not text:
        return False
    if len(text) < 8:
        return False
    alpha = re.findall(r"[A-Za-z]", text)
    return len(alpha) >= 6


def _is_valid_ja_text(text: str) -> bool:
    if not text:
        return False
    if len(text) < 4:
        return False
    ja_chars = re.findall(r"[ぁ-んァ-ン一-龯ー]", text)
    return len(ja_chars) >= 3


def _auto_keywords(lang: str, text: str) -> list[str]:
    text = _normalize_text(text)
    if lang == "en":
        tokens = re.findall(r"[a-z0-9']+", text.lower())
        stop = {
            "a", "an", "the", "is", "am", "are", "to", "of", "and", "or", "for", "in", "on",
            "at", "this", "that", "it", "i", "you", "we", "they", "he", "she", "be", "was", "were",
            "do", "does", "did", "have", "has", "had", "can", "could", "will", "would", "should",
        }
        out: list[str] = []
        for tok in tokens:
            if len(tok) <= 2 or tok in stop:
                continue
            if tok not in out:
                out.append(tok)
        return out[:8]

    if lang == "ja":
        # Extract short kanji compounds (2-4 chars) and katakana loanwords (3-6 chars).
        # Short units survive minor ASR errors better than full-phrase substring matches.
        kanji = re.findall(r"[一-龯]{2,4}", text)
        kana = re.findall(r"[ァ-ン]{3,6}", text)
        out: list[str] = []
        for tok in kanji + kana:
            if tok not in out:
                out.append(tok)
        return out[:8]

    return []


def _decode_audio_bytes_or_path(audio_item: dict[str, Any]) -> np.ndarray:
    import av  # type: ignore[import-untyped]

    chunks: list[np.ndarray] = []

    if isinstance(audio_item.get("bytes"), (bytes, bytearray)):
        bio = io.BytesIO(audio_item["bytes"])
        container = av.open(bio)
    else:
        path = audio_item.get("path")
        if not path:
            raise ValueError("audio item has neither bytes nor path")
        container = av.open(str(path))

    with container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise ValueError("no audio stream")
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
        raise ValueError("empty decoded audio")
    return np.concatenate(chunks).astype(np.int16, copy=False)


def _fit_to_duration(samples: np.ndarray, target_samples: int) -> np.ndarray:
    if samples.size == 0:
        return np.zeros(target_samples, dtype=np.int16)
    if len(samples) >= target_samples:
        # Take from the beginning so the start of the sentence is preserved.
        return samples[:target_samples].astype(np.int16, copy=False)
    out = np.zeros(target_samples, dtype=np.int16)
    out[: len(samples)] = samples
    return out


def _fit_to_5s(samples: np.ndarray) -> np.ndarray:
    return _fit_to_duration(samples, TARGET_SAMPLES)


def _write_wav(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(TARGET_SR)
        wf.writeframes(samples.astype(np.int16, copy=False).tobytes())


def _speech_with_music_mix(speech_pcm16: np.ndarray, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    speech = speech_pcm16.astype(np.float32) / 32768.0
    n = len(speech)
    t = np.arange(n, dtype=np.float32) / TARGET_SR

    # Procedural "music-like" bed (chords + rhythmic envelope + noise).
    f1 = rng.choice([110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 246.94])
    f2 = f1 * rng.choice([1.25, 1.3333, 1.5, 2.0])
    f3 = f1 * rng.choice([2.5, 3.0, 4.0])
    music = (
        0.55 * np.sin(2.0 * math.pi * f1 * t)
        + 0.35 * np.sin(2.0 * math.pi * f2 * t + 0.7)
        + 0.20 * np.sin(2.0 * math.pi * f3 * t + 1.4)
    )

    bpm = float(rng.choice([80, 90, 100, 110, 120, 128]))
    beat_hz = bpm / 60.0
    gate = (np.sin(2.0 * math.pi * beat_hz * t) > -0.2).astype(np.float32)
    env = 0.35 + 0.65 * gate
    noise = rng.normal(0.0, 0.03, size=n).astype(np.float32)
    music = (music * env + noise).astype(np.float32)

    # Target SNR (speech vs music)
    speech_rms = float(np.sqrt(np.mean(np.square(speech)) + 1e-9))
    music_rms = float(np.sqrt(np.mean(np.square(music)) + 1e-9))
    target_snr_db = float(rng.uniform(2.0, 8.0))
    target_ratio = 10 ** (target_snr_db / 20.0)
    scale = speech_rms / (music_rms * target_ratio + 1e-9)
    mixed = speech + music * scale
    mixed = np.clip(mixed, -0.98, 0.98)
    return (mixed * 32767.0).astype(np.int16)


def _pick_transcript(row: dict[str, Any], lang: str) -> str:
    if lang == "en":
        text = row.get("transcription") or row.get("english_transcription") or ""
    else:
        text = row.get("transcript") or row.get("transcription") or row.get("text") or ""
    return _normalize_text(str(text))


def _load_samples(lang: str, need: int) -> list[SpeechSample]:
    if lang == "en":
        ds = load_dataset(EN_DATASET, EN_CONFIG, split="train")
        ds = ds.cast_column("audio", Audio(decode=False))
        validator = _is_valid_en_text
    else:
        if JA_CONFIG is None:
            ds = load_dataset(JA_DATASET, split="train")
        else:
            ds = load_dataset(JA_DATASET, JA_CONFIG, split="train")
        ds = ds.cast_column("audio", Audio(decode=False))
        validator = _is_valid_ja_text

    out: list[SpeechSample] = []
    seen_text: set[str] = set()
    max_scan = min(len(ds), 1200)

    for i in range(max_scan):
        row = ds[i]
        text = _pick_transcript(row, lang)
        if not validator(text):
            continue
        key = text.lower() if lang == "en" else text
        if key in seen_text:
            continue
        audio_item = row.get("audio")
        if not isinstance(audio_item, dict):
            continue
        try:
            pcm = _decode_audio_bytes_or_path(audio_item)
            dur = JA_DURATION_SEC if lang == "ja" else EN_DURATION_SEC
            pcm = _fit_to_duration(pcm, int(TARGET_SR * dur))
        except Exception:
            continue

        source_id = f"{EN_DATASET}:{EN_CONFIG}:{i}" if lang == "en" else f"{JA_DATASET}:train:{i}"
        out.append(SpeechSample(lang=lang, transcript=text, pcm16=pcm, source_id=source_id))
        seen_text.add(key)
        if len(out) >= need:
            break

    if len(out) < need:
        raise RuntimeError(f"Not enough {lang} samples: need {need}, got {len(out)}")
    return out


def _manifest_entry(
    *,
    case_id: str,
    lang: str,
    source_type: str,
    transcript: str,
    local_path: str,
    source_id: str,
) -> dict[str, Any]:
    return {
        "id": case_id,
        "lang": lang,
        "source_type": source_type,
        "expected_text": transcript,
        "keywords": _auto_keywords(lang, transcript),
        "local_path": local_path.replace("\\", "/"),
        "source_url": "",
        "start_sec": 0.0,
        "duration_sec": JA_DURATION_SEC if lang == "ja" else EN_DURATION_SEC,
        "license_note": f"HF dataset sample: {source_id}",
        "status": "auto_filled",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-fill external source manifests with real audio.")
    parser.add_argument("--root", default="services/local-ai/eval/sources")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    root = Path(args.root).resolve()
    raw_root = root / "raw"
    (raw_root / "en" / "human").mkdir(parents=True, exist_ok=True)
    (raw_root / "en" / "music").mkdir(parents=True, exist_ok=True)
    (raw_root / "ja" / "human").mkdir(parents=True, exist_ok=True)
    (raw_root / "ja" / "music").mkdir(parents=True, exist_ok=True)

    en_need = EN_HUMAN_COUNT + EN_MUSIC_COUNT
    ja_need = JA_HUMAN_COUNT + JA_MUSIC_COUNT

    en_samples = _load_samples("en", en_need)
    ja_samples = _load_samples("ja", ja_need)

    human_entries: list[dict[str, Any]] = []
    music_entries: list[dict[str, Any]] = []
    provenance: dict[str, Any] = {"en": [], "ja": []}

    # EN human
    for i in range(EN_HUMAN_COUNT):
        case_id = f"en_human_{i+1:03d}"
        rel = Path("raw/en/human") / f"{case_id}.wav"
        _write_wav(root / rel, en_samples[i].pcm16)
        human_entries.append(
            _manifest_entry(
                case_id=case_id,
                lang="en",
                source_type="human_external",
                transcript=en_samples[i].transcript,
                local_path=str(rel),
                source_id=en_samples[i].source_id,
            )
        )
        provenance["en"].append({"id": case_id, "source": en_samples[i].source_id, "type": "human"})

    # EN music
    for i in range(EN_MUSIC_COUNT):
        base = en_samples[EN_HUMAN_COUNT + i]
        case_id = f"en_music_{i+1:03d}"
        rel = Path("raw/en/music") / f"{case_id}.wav"
        mixed = _speech_with_music_mix(base.pcm16, seed=args.seed + 1000 + i)
        _write_wav(root / rel, mixed)
        music_entries.append(
            _manifest_entry(
                case_id=case_id,
                lang="en",
                source_type="music_mixed",
                transcript=base.transcript,
                local_path=str(rel),
                source_id=base.source_id,
            )
        )
        provenance["en"].append({"id": case_id, "source": base.source_id, "type": "music_mixed_generated"})

    # JA human
    for i in range(JA_HUMAN_COUNT):
        case_id = f"ja_human_{i+1:03d}"
        rel = Path("raw/ja/human") / f"{case_id}.wav"
        _write_wav(root / rel, ja_samples[i].pcm16)
        human_entries.append(
            _manifest_entry(
                case_id=case_id,
                lang="ja",
                source_type="human_external",
                transcript=ja_samples[i].transcript,
                local_path=str(rel),
                source_id=ja_samples[i].source_id,
            )
        )
        provenance["ja"].append({"id": case_id, "source": ja_samples[i].source_id, "type": "human"})

    # JA music
    for i in range(JA_MUSIC_COUNT):
        base = ja_samples[JA_HUMAN_COUNT + i]
        case_id = f"ja_music_{i+1:03d}"
        rel = Path("raw/ja/music") / f"{case_id}.wav"
        mixed = _speech_with_music_mix(base.pcm16, seed=args.seed + 2000 + i)
        _write_wav(root / rel, mixed)
        music_entries.append(
            _manifest_entry(
                case_id=case_id,
                lang="ja",
                source_type="music_mixed",
                transcript=base.transcript,
                local_path=str(rel),
                source_id=base.source_id,
            )
        )
        provenance["ja"].append({"id": case_id, "source": base.source_id, "type": "music_mixed_generated"})

    human_payload = {
        "description": "Auto-filled human speech clips from HF public datasets.",
        "entries": human_entries,
    }
    music_payload = {
        "description": "Auto-filled music-mixed clips (speech + generated background music).",
        "entries": music_entries,
    }

    human_path = root / "human_external_sources.json"
    music_path = root / "music_sources.json"
    provenance_path = root / "external_sources_provenance.json"

    human_path.write_text(json.dumps(human_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    music_path.write_text(json.dumps(music_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {human_path}")
    print(f"Wrote {music_path}")
    print(f"Wrote {provenance_path}")
    print(f"Counts: human={len(human_entries)} music={len(music_entries)} total={len(human_entries)+len(music_entries)}")


if __name__ == "__main__":
    main()
