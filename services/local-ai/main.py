"""local-ai service — faster-whisper STT + argostranslate translation."""

from __future__ import annotations

import base64
import logging
import os
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
DEVICE = os.environ.get("WHISPER_DEVICE", "auto")  # "auto" | "cpu" | "cuda"
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "sorisori", "models"))

SAMPLE_RATE = 24_000  # PCM16 mono 24 kHz from desktop capture


# ---------------------------------------------------------------------------
# Global state (loaded once at startup)
# ---------------------------------------------------------------------------

_whisper_model = None
_argos_ready = False


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
    _whisper_model = WhisperModel(
        MODEL_SIZE,
        device=device,
        compute_type=COMPUTE_TYPE,
        download_root=MODELS_DIR,
    )
    log.info("faster-whisper model loaded.")


def _load_argos():
    global _argos_ready
    try:
        import argostranslate.package  # type: ignore[import-untyped]
        import argostranslate.translate  # type: ignore[import-untyped]

        installed = argostranslate.translate.get_installed_languages()
        codes = {lang.code for lang in installed}
        if "en" not in codes or "ko" not in codes:
            log.info("Argos en→ko language pack not installed. Downloading...")
            argostranslate.package.update_package_index()
            available = argostranslate.package.get_available_packages()
            en_ko = next(
                (p for p in available if p.from_code == "en" and p.to_code == "ko"),
                None,
            )
            if en_ko:
                argostranslate.package.install_from_path(en_ko.download())
                log.info("Argos en→ko pack installed.")
            else:
                log.warning("Argos en→ko pack not found in index.")
        else:
            log.info("Argos en→ko language pack already installed.")
        _argos_ready = True
    except Exception as exc:
        log.warning("Argos Translate init failed: %s. Translation will be unavailable.", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_whisper()
    _load_argos()
    yield


app = FastAPI(title="sorisori-local-ai", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class TranscribeRequest(BaseModel):
    audio_base64: str
    language: Optional[str] = None  # None = auto-detect


class TranscribeResponse(BaseModel):
    transcript: str
    language: Optional[str] = None  # detected language code (e.g. "en", "ja")
    translated_to_english: bool = False  # True if Whisper used task="translate"


class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "ko"
    source_lang: str = "en"  # if "auto", will be inferred from installed packs


class TranslateResponse(BaseModel):
    translatedText: str


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
        "argos_ready": _argos_ready,
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

    # Convert PCM16 LE → float32 in [-1, 1]
    samples = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    # If caller specifies a language, skip the probe pass entirely.
    if req.language:
        detected_lang = req.language
    else:
        # First pass: detect language (no beam search, no vad to keep it fast)
        _, probe = _whisper_model.transcribe(
            samples,
            language=None,
            beam_size=1,
            vad_filter=False,
        )
        detected_lang = probe.language if probe else "en"

    # Non-English → use Whisper's built-in translate task (outputs English)
    # English → normal transcribe
    use_translate = detected_lang not in ("en", None)
    task = "translate" if use_translate else "transcribe"

    segments, info = _whisper_model.transcribe(
        samples,
        language=detected_lang,
        task=task,
        beam_size=5,
        vad_filter=True,          # Silero VAD: filters music/noise, speech only
        vad_parameters=dict(
            min_silence_duration_ms=300,
            speech_pad_ms=200,
        ),
    )

    transcript = "".join(seg.text for seg in segments).strip()
    return TranscribeResponse(
        transcript=transcript,
        language=detected_lang,
        translated_to_english=use_translate,
    )


def _argos_translate(text: str, from_code: str, to_code: str) -> Optional[str]:
    """Single-hop Argos translation. Returns None if pack not installed."""
    import argostranslate.translate  # type: ignore[import-untyped]

    installed = argostranslate.translate.get_installed_languages()
    from_lang = next((l for l in installed if l.code == from_code), None)
    to_lang = next((l for l in installed if l.code == to_code), None)
    if from_lang is None or to_lang is None:
        return None
    translation_obj = from_lang.get_translation(to_lang)
    if translation_obj is None:
        return None
    return translation_obj.translate(text)


@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    if not _argos_ready:
        raise HTTPException(503, "Argos Translate not ready.")

    src = req.source_lang
    tgt = req.target_lang

    # Direct translation attempt
    result = _argos_translate(req.text, src, tgt)
    if result is not None:
        return TranslateResponse(translatedText=result)

    # Two-hop fallback via English: src→en→tgt
    if src != "en" and tgt != "en":
        en_text = _argos_translate(req.text, src, "en")
        if en_text is not None:
            final = _argos_translate(en_text, "en", tgt)
            if final is not None:
                return TranslateResponse(translatedText=final)

    raise HTTPException(
        422,
        f"No translation path from '{src}' to '{tgt}'. "
        "Install the required Argos language pack.",
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("LOCAL_AI_HOST", "127.0.0.1")
    port = int(os.environ.get("LOCAL_AI_PORT", "8789"))
    # Use app object directly (required for PyInstaller packaging)
    uvicorn.run(app, host=host, port=port, log_level="info")
