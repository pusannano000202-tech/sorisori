"""local-ai service — faster-whisper STT + MarianMT translation (en/ja → ko)."""

from __future__ import annotations

import base64
import logging
import os
import unicodedata
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [local-ai] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "sorisori", "models"))

SAMPLE_RATE = 24_000

# MarianMT model names
MODEL_EN_KO = "Helsinki-NLP/opus-mt-tc-big-en-ko"
# Languages that use no spaces between words — use char count for fragment filter
CJK_LANGS = {"ja", "zh", "ko"}

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

_whisper_model = None

# Translation models: keyed by source lang code
_mt_tokenizers: dict[str, object] = {}
_mt_models: dict[str, object] = {}
_mt_ready = False

_last_transcript: dict[str, str] = {}


def _load_whisper():
    global _whisper_model
    from faster_whisper import WhisperModel  # type: ignore[import-untyped]

    device = DEVICE
    if device == "auto":
        try:
            import torch  # type: ignore[import-untyped]
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"

    log.info("Loading faster-whisper model=%s device=%s compute_type=%s", MODEL_SIZE, device, COMPUTE_TYPE)
    _whisper_model = WhisperModel(MODEL_SIZE, device=device, compute_type=COMPUTE_TYPE, download_root=MODELS_DIR)
    log.info("faster-whisper model loaded.")


def _load_mt_model(lang_code: str, model_name: str) -> bool:
    """Load a single MarianMT model. Returns True on success."""
    try:
        from transformers import MarianMTModel, MarianTokenizer  # type: ignore[import-untyped]
        cache_dir = os.path.join(MODELS_DIR, "marian")
        log.info("Loading MarianMT %s model=%s", lang_code, model_name)
        _mt_tokenizers[lang_code] = MarianTokenizer.from_pretrained(model_name, cache_dir=cache_dir)
        _mt_models[lang_code] = MarianMTModel.from_pretrained(model_name, cache_dir=cache_dir)
        log.info("MarianMT %s→ko loaded.", lang_code)
        return True
    except Exception as exc:
        log.warning("MarianMT %s load failed: %s", lang_code, exc)
        return False


def _load_translation():
    global _mt_ready
    ok_en = _load_mt_model("en", MODEL_EN_KO)
    _mt_ready = ok_en


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_whisper()
    _load_translation()
    yield


app = FastAPI(title="sorisori-local-ai", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class TranscribeRequest(BaseModel):
    audio_base64: str
    language: Optional[str] = None


class TranscribeResponse(BaseModel):
    transcript: str
    language: Optional[str] = None
    translated_to_english: bool = False


class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "ko"
    source_lang: str = "en"


class TranslateResponse(BaseModel):
    translatedText: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_cjk(text: str) -> bool:
    """Returns True if text contains CJK (Japanese/Chinese/Korean) characters."""
    for ch in text:
        cat = unicodedata.category(ch)
        name = unicodedata.name(ch, "")
        if "CJK" in name or "HIRAGANA" in name or "KATAKANA" in name or "HANGUL" in name:
            return True
    return False


def _is_short_fragment(text: str, lang: Optional[str]) -> bool:
    """True if the text is too short to be meaningful."""
    if not text:
        return True
    if lang in CJK_LANGS or _is_cjk(text):
        # CJK: filter if fewer than 6 characters (excludes punctuation)
        char_count = sum(1 for c in text if not unicodedata.category(c).startswith("P"))
        return char_count < 6
    # Space-separated: filter if fewer than 3 words
    return len(text.split()) < 3


def _similarity_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    def trigrams(s: str) -> set:
        s = s.lower().strip()
        return {s[i:i+3] for i in range(len(s) - 2)} if len(s) >= 3 else {s}
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb:
        return 1.0 if a.lower().strip() == b.lower().strip() else 0.0
    return len(ta & tb) / len(ta | tb)


def _is_hallucination(text: str, lang_key: str) -> bool:
    prev = _last_transcript.get(lang_key, "")
    if not prev:
        return False
    ratio = _similarity_ratio(text, prev)
    if ratio >= 0.90:
        log.info("Hallucination filtered (similarity=%.2f): %r", ratio, text[:60])
        return True
    return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return JSONResponse({
        "status": "ok",
        "service": "sorisori-local-ai",
        "whisper_model": MODEL_SIZE,
        "whisper_ready": _whisper_model is not None,
        "translation_ready": _mt_ready,
        "translation_langs": list(_mt_models.keys()),
    })


@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe(req: TranscribeRequest):
    if _whisper_model is None:
        raise HTTPException(503, "Whisper model not loaded yet.")

    try:
        pcm16_bytes = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(400, "audio_base64 is not valid base64.")

    if len(pcm16_bytes) < 2:
        return TranscribeResponse(transcript="", translated_to_english=False)

    samples = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    if req.language:
        detected_lang = req.language
    else:
        _, probe = _whisper_model.transcribe(samples, language=None, beam_size=1, vad_filter=False)
        detected_lang = probe.language if probe else "en"

    # English → transcribe directly.
    # Other languages → use Whisper task=translate to get English first.
    if detected_lang == "en":
        task = "transcribe"
        use_translate = False
    else:
        task = "translate"
        use_translate = True

    segments, _ = _whisper_model.transcribe(
        samples,
        language=detected_lang,
        task=task,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300, speech_pad_ms=200),
    )

    transcript = "".join(seg.text for seg in segments).strip()

    # If Whisper was supposed to translate (non-English) but still output CJK chars,
    # the translation failed — drop the transcript to avoid garbage output.
    if use_translate and transcript and _is_cjk(transcript):
        log.info("Whisper translate failed (CJK in output, lang=%s): %r", detected_lang, transcript[:60])
        transcript = ""

    # Short fragment filter (language-aware)
    if _is_short_fragment(transcript, "en"):  # After translate task, output is always English
        if transcript:
            log.info("Short fragment dropped: %r", transcript)
        transcript = ""

    # Hallucination filter
    lang_key = detected_lang or "auto"
    if transcript and _is_hallucination(transcript, lang_key):
        transcript = ""
    elif transcript:
        _last_transcript[lang_key] = transcript

    return TranscribeResponse(transcript=transcript, language=detected_lang, translated_to_english=use_translate)


def _marian_translate(text: str, src_lang: str) -> Optional[str]:
    tokenizer = _mt_tokenizers.get(src_lang)
    model = _mt_models.get(src_lang)
    if tokenizer is None or model is None:
        return None
    try:
        inputs = tokenizer([text], return_tensors="pt", padding=True, truncation=True, max_length=512)
        translated = model.generate(**inputs, num_beams=4, max_length=512)
        result = tokenizer.batch_decode(translated, skip_special_tokens=True)
        return result[0] if result else None
    except Exception as exc:
        log.warning("MarianMT %s→ko error: %s", src_lang, exc)
        return None


@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    if not _mt_ready:
        raise HTTPException(503, "Translation model not ready.")

    # If text still contains CJK characters and we have no direct model, drop it
    # (means Whisper's translate task failed — better to return nothing than garbage)
    if _is_cjk(req.text) and req.source_lang not in _mt_models:
        raise HTTPException(422, f"CJK text with no {req.source_lang}→ko model available.")

    src = req.source_lang

    # Try direct model first
    result = _marian_translate(req.text, src)
    if result is not None:
        return TranslateResponse(translatedText=result)

    # Fallback: non-English source with English-looking text → en→ko
    if src != "en" and not _is_cjk(req.text):
        result = _marian_translate(req.text, "en")
        if result is not None:
            return TranslateResponse(translatedText=result)

    raise HTTPException(422, f"No translation path from '{src}' to '{req.target_lang}'.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("LOCAL_AI_HOST", "127.0.0.1")
    port = int(os.environ.get("LOCAL_AI_PORT", "8789"))
    uvicorn.run(app, host=host, port=port, log_level="info")
