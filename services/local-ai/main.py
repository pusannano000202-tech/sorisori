"""local-ai service — faster-whisper STT + Argos/Marian translation (en/ja → ko)."""

from __future__ import annotations

import base64
import faulthandler
import logging
import os
import re
import sys
import traceback
import unicodedata
from contextlib import asynccontextmanager
from typing import Optional

# Enable faulthandler so native crashes (segfault, stack overrun) print Python traceback.
faulthandler.enable(sys.stderr, all_threads=True)
sys.stderr.write(f"[boot] python={sys.version.split()[0]} cwd={os.getcwd()}\n")
sys.stderr.flush()


def _preload_ctranslate2_runtime() -> None:
    """In PyInstaller bundles, both `torch/lib/` and `ctranslate2/` ship `libiomp5md.dll`.
    Windows DLL loader picks `torch/lib`'s copy first, which has a different ABI than the
    one ctranslate2 was built against — causing STATUS_STACK_BUFFER_OVERRUN (0xC0000409)
    when ctranslate2 first calls into OpenMP. Pin the ctranslate2 directory at the front
    of the DLL search path AND pre-load every DLL it ships so torch's copies never win.
    """
    if not getattr(sys, "frozen", False):
        return
    base_dir = getattr(sys, "_MEIPASS", None) or os.path.dirname(sys.executable)
    ct2_dir = os.path.join(base_dir, "ctranslate2")
    if not os.path.isdir(ct2_dir):
        sys.stderr.write(f"[boot] preload: skipped (no {ct2_dir})\n"); sys.stderr.flush()
        return
    if hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(ct2_dir)
            sys.stderr.write(f"[boot] preload: add_dll_directory {ct2_dir}\n"); sys.stderr.flush()
        except OSError as exc:
            sys.stderr.write(f"[boot] preload: add_dll_directory failed: {exc}\n"); sys.stderr.flush()
    import ctypes
    for name in ("libiomp5md.dll", "cudnn64_9.dll", "ctranslate2.dll"):
        path = os.path.join(ct2_dir, name)
        if not os.path.exists(path):
            sys.stderr.write(f"[boot] preload: missing {name}\n"); sys.stderr.flush()
            continue
        try:
            ctypes.CDLL(path)
            sys.stderr.write(f"[boot] preload: loaded {name}\n"); sys.stderr.flush()
        except OSError as exc:
            sys.stderr.write(f"[boot] preload: {name} failed: {exc}\n"); sys.stderr.flush()


_preload_ctranslate2_runtime()

# Import ctranslate2 EARLY — before numpy/FastAPI/anything that might pull in
# conflicting math runtimes. Bundled exe crashes with STATUS_STACK_BUFFER_OVERRUN
# if ctranslate2 is imported lazily inside lifespan.
sys.stderr.write("[boot] importing ctranslate2 early\n"); sys.stderr.flush()
try:
    import ctranslate2 as _ctranslate2_early  # noqa: F401
    sys.stderr.write(f"[boot] ctranslate2 OK ver={_ctranslate2_early.__version__}\n"); sys.stderr.flush()
except BaseException:
    sys.stderr.write("[boot] ctranslate2 EARLY IMPORT FAILED:\n"); sys.stderr.flush()
    traceback.print_exc(file=sys.stderr); sys.stderr.flush()
    raise

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
LOCAL_SOURCE_DIR = os.path.dirname(__file__)

SAMPLE_RATE = 24_000

# MarianMT model names
MODEL_EN_KO = "Helsinki-NLP/opus-mt-tc-big-en-ko"
JA_DIRECT_MODEL = os.environ.get("LOCAL_AI_JA_DIRECT_MODEL", "facebook/nllb-200-distilled-600M")
JA_TRANSLATION_MODE = os.environ.get("LOCAL_AI_JA_TRANSLATION_MODE", "auto").strip().lower() or "auto"
if JA_TRANSLATION_MODE not in {"auto", "bridge", "direct"}:
    log.warning("Invalid LOCAL_AI_JA_TRANSLATION_MODE=%r, falling back to 'auto'", JA_TRANSLATION_MODE)
    JA_TRANSLATION_MODE = "auto"
JA_SOURCE_LANG_CODE = os.environ.get("LOCAL_AI_JA_SOURCE_LANG_CODE", "jpn_Jpan")
KO_TARGET_LANG_CODE = os.environ.get("LOCAL_AI_KO_TARGET_LANG_CODE", "kor_Hang")
LANGUAGE_HINT_MODE = os.environ.get("LOCAL_AI_LANGUAGE_HINT_MODE", "strict").strip().lower() or "strict"
if LANGUAGE_HINT_MODE not in {"strict", "soft"}:
    log.warning("Invalid LOCAL_AI_LANGUAGE_HINT_MODE=%r, falling back to 'strict'", LANGUAGE_HINT_MODE)
    LANGUAGE_HINT_MODE = "strict"
ARGOS_PACKS = [
    ("en", "ko"),
    ("ja", "en"),
]
# Languages that use no spaces between words — use char count for fragment filter
CJK_LANGS = {"ja", "zh", "ko"}

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

_whisper_model = None

# Translation models: keyed by source lang code
_argos_languages: dict[str, object] = {}
_argos_translations: dict[tuple[str, str], object] = {}
_argos_ready = False

_ja_direct_tokenizer = None
_ja_direct_model = None
_ja_direct_ready = False

_mt_tokenizers: dict[str, object] = {}
_mt_models: dict[str, object] = {}
_mt_ready = False

_last_transcript: dict[str, str] = {}


def _load_whisper():
    global _whisper_model
    sys.stderr.write("[boot] _load_whisper: importing ctranslate2\n"); sys.stderr.flush()
    import ctranslate2  # noqa: F401
    sys.stderr.write(f"[boot] _load_whisper: ctranslate2 OK ver={ctranslate2.__version__}\n"); sys.stderr.flush()
    sys.stderr.write("[boot] _load_whisper: importing tokenizers\n"); sys.stderr.flush()
    import tokenizers  # noqa: F401
    sys.stderr.write("[boot] _load_whisper: tokenizers OK\n"); sys.stderr.flush()
    sys.stderr.write("[boot] _load_whisper: importing onnxruntime\n"); sys.stderr.flush()
    import onnxruntime  # noqa: F401
    sys.stderr.write(f"[boot] _load_whisper: onnxruntime OK ver={onnxruntime.__version__}\n"); sys.stderr.flush()
    sys.stderr.write("[boot] _load_whisper: importing faster_whisper\n"); sys.stderr.flush()
    from faster_whisper import WhisperModel  # type: ignore[import-untyped]
    sys.stderr.write("[boot] _load_whisper: faster_whisper OK\n"); sys.stderr.flush()

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


def _load_argos():
    global _argos_languages, _argos_translations, _argos_ready

    _argos_languages = {}
    _argos_translations = {}
    _argos_ready = False

    try:
        import argostranslate.translate  # type: ignore[import-untyped]

        _argos_languages = {
            lang.code: lang for lang in argostranslate.translate.get_installed_languages()
        }
        installed_codes = sorted(_argos_languages.keys())
        log.info("Argos installed languages: %s", ", ".join(installed_codes) or "(none)")

        required_missing = [
            f"{src}->{dst}" for src, dst in ARGOS_PACKS if src not in _argos_languages or dst not in _argos_languages
        ]
        if required_missing:
            log.warning("Argos language packs missing: %s", ", ".join(required_missing))
            return

        _argos_ready = True
        log.info("Argos translation ready.")
    except Exception as exc:
        log.warning("Argos load failed: %s", exc)


def _existing_model_roots(*subdirs: str) -> list[str]:
    candidates = [
        os.path.join(MODELS_DIR, *subdirs),
        MODELS_DIR,
        os.path.join(LOCAL_SOURCE_DIR, "models", *subdirs),
        os.path.join(LOCAL_SOURCE_DIR, "models"),
    ]
    seen: set[str] = set()
    roots: list[str] = []
    for candidate in candidates:
        normalized = os.path.abspath(candidate)
        if normalized in seen:
            continue
        seen.add(normalized)
        if os.path.isdir(normalized):
            roots.append(normalized)
    return roots


def _find_hf_snapshot(model_name: str, *subdirs: str, required_files: tuple[str, ...] = ()) -> Optional[str]:
    repo_dir_name = f"models--{model_name.replace('/', '--')}"
    for root in _existing_model_roots(*subdirs):
        snapshots_dir = os.path.join(root, repo_dir_name, "snapshots")
        if not os.path.isdir(snapshots_dir):
            continue

        snapshots = [
            os.path.join(snapshots_dir, entry)
            for entry in os.listdir(snapshots_dir)
            if os.path.isdir(os.path.join(snapshots_dir, entry))
        ]
        valid_snapshots = []
        for snapshot in snapshots:
            if required_files and not all(os.path.exists(os.path.join(snapshot, name)) for name in required_files):
                continue
            valid_snapshots.append(snapshot)

        if valid_snapshots:
            return max(valid_snapshots, key=os.path.getmtime)
        if snapshots and not required_files:
            return max(snapshots, key=os.path.getmtime)

    return None


def _load_ja_direct_model():
    global _ja_direct_tokenizer, _ja_direct_model, _ja_direct_ready

    _ja_direct_tokenizer = None
    _ja_direct_model = None
    _ja_direct_ready = False

    if JA_TRANSLATION_MODE == "bridge":
        log.info("Japanese direct translation disabled by mode=bridge")
        return

    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer  # type: ignore[import-untyped]

        cache_dir = os.path.join(MODELS_DIR, "nllb")
        # Auto mode should still be able to recover by downloading from Hub
        # if local snapshot lookup misses due environment-specific path quirks.
        local_only = False
        required_snapshot_files = ("config.json", "tokenizer_config.json")
        model_source = _find_hf_snapshot(
            JA_DIRECT_MODEL,
            "nllb",
            required_files=required_snapshot_files,
        ) or _find_hf_snapshot(
            JA_DIRECT_MODEL,
            required_files=required_snapshot_files,
        )
        if model_source is None:
            model_source = JA_DIRECT_MODEL
        log.info(
            "Loading Japanese direct model=%s source=%s mode=%s local_only=%s",
            JA_DIRECT_MODEL,
            model_source,
            JA_TRANSLATION_MODE,
            local_only,
        )
        # `use_fast=False` avoids tokenizer initialization failures seen in local Windows tests.
        _ja_direct_tokenizer = AutoTokenizer.from_pretrained(
            model_source,
            cache_dir=cache_dir,
            use_fast=False,
            local_files_only=local_only,
        )
        _ja_direct_model = AutoModelForSeq2SeqLM.from_pretrained(
            model_source,
            cache_dir=cache_dir,
            local_files_only=local_only,
        )
        _ja_direct_ready = True
        log.info("Japanese direct model loaded.")
    except Exception as exc:
        log.warning("Japanese direct model load failed: %s", exc)


def _load_translation():
    global _mt_ready
    _load_argos()
    _load_ja_direct_model()
    ok_en = _load_mt_model("en", MODEL_EN_KO)
    _mt_ready = ok_en


@asynccontextmanager
async def lifespan(_app: FastAPI):
    sys.stderr.write("[boot] lifespan: entering\n"); sys.stderr.flush()
    try:
        sys.stderr.write("[boot] lifespan: about to call _load_whisper\n"); sys.stderr.flush()
        _load_whisper()
        sys.stderr.write("[boot] lifespan: _load_whisper returned\n"); sys.stderr.flush()
        _load_translation()
        sys.stderr.write("[boot] lifespan: _load_translation returned\n"); sys.stderr.flush()
    except BaseException:
        sys.stderr.write("[boot] lifespan: EXCEPTION:\n"); sys.stderr.flush()
        traceback.print_exc(file=sys.stderr); sys.stderr.flush()
        raise
    yield


app = FastAPI(title="sorisori-local-ai", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


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


def _contains_hangul(text: str) -> bool:
    for ch in text:
        name = unicodedata.name(ch, "")
        if "HANGUL" in name:
            return True
    return False


def _contains_latin(text: str) -> bool:
    for ch in text:
        name = unicodedata.name(ch, "")
        if "LATIN" in name:
            return True
    return False


def _contains_japanese_kana(text: str) -> bool:
    for ch in text:
        name = unicodedata.name(ch, "")
        if "HIRAGANA" in name or "KATAKANA" in name:
            return True
    return False


def _apply_language_hint_guard(transcript: str, language_hint: Optional[str]) -> str:
    normalized = _normalize_text_for_display(transcript)
    if not normalized or not language_hint:
        return normalized

    hint = language_hint.lower()

    if hint == "en":
        if _contains_hangul(normalized):
            log.info("Language hint=en dropped Hangul transcript: %r", normalized[:80])
            return ""
        if LANGUAGE_HINT_MODE == "strict" and not _contains_latin(normalized):
            log.info("Language hint=en strict dropped non-Latin transcript: %r", normalized[:80])
            return ""
        return normalized

    if hint == "ja":
        if _contains_hangul(normalized):
            log.info("Language hint=ja dropped Hangul transcript: %r", normalized[:80])
            return ""
        if LANGUAGE_HINT_MODE == "strict":
            if not (_contains_japanese_kana(normalized) or _is_cjk(normalized)):
                log.info("Language hint=ja strict dropped non-Japanese transcript: %r", normalized[:80])
                return ""
        return normalized

    return normalized


def _normalize_text_for_display(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.replace("\r", " ").replace("\n", " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # Remove repeated punctuation and decorative artifacts that Whisper sometimes emits.
    normalized = re.sub(r"([!?.,])\1{1,}", r"\1", normalized)
    normalized = re.sub(r"(?:\s*[-–—]\s*){2,}", " — ", normalized)
    normalized = re.sub(r"\s+([,.!?;:])", r"\1", normalized)
    normalized = re.sub(r"([(\[{])\s+", r"\1", normalized)
    normalized = re.sub(r"\s+([)\]}])", r"\1", normalized)
    return normalized.strip()


def _split_translation_chunks(text: str, max_chars: int = 280) -> list[str]:
    normalized = _normalize_text_for_display(text)
    if not normalized:
        return []

    # Prefer sentence-like boundaries first.
    sentence_candidates = re.split(r"(?<=[.!?])\s+|(?<=[。！？])\s*", normalized)
    sentences = [candidate.strip() for candidate in sentence_candidates if candidate.strip()]

    if not sentences:
        return [normalized]

    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        if len(sentence) > max_chars:
            words = sentence.split()
            oversized_current = ""
            for word in words:
                tentative = f"{oversized_current} {word}".strip()
                if oversized_current and len(tentative) > max_chars:
                    chunks.append(oversized_current)
                    oversized_current = word
                else:
                    oversized_current = tentative
            if oversized_current:
                if current:
                    chunks.append(current)
                    current = ""
                chunks.append(oversized_current)
            continue

        tentative = f"{current} {sentence}".strip()
        if current and len(tentative) > max_chars:
            chunks.append(current)
            current = sentence
        else:
            current = tentative

    if current:
        chunks.append(current)

    return chunks


def _translate_in_chunks(text: str, src_lang: str) -> Optional[str]:
    chunks = _split_translation_chunks(text)
    if not chunks:
        return ""

    translated_chunks: list[str] = []
    for chunk in chunks:
        translated = _marian_translate(chunk, src_lang)
        if translated is None:
            return None
        translated_chunks.append(translated.strip())

    merged = " ".join(part for part in translated_chunks if part)
    return _normalize_text_for_display(merged)


def _get_lang_token_id(tokenizer, lang_code: str) -> Optional[int]:
    lang_map = getattr(tokenizer, "lang_code_to_id", None)
    if isinstance(lang_map, dict) and lang_code in lang_map:
        return lang_map[lang_code]

    get_lang_id = getattr(tokenizer, "get_lang_id", None)
    if callable(get_lang_id):
        try:
            return get_lang_id(lang_code)
        except Exception:
            pass

    try:
        token_id = tokenizer.convert_tokens_to_ids(lang_code)
    except Exception:
        return None
    if isinstance(token_id, int) and token_id >= 0:
        return token_id
    return None


def _ja_direct_translate_once(text: str) -> Optional[str]:
    if _ja_direct_tokenizer is None or _ja_direct_model is None:
        return None

    target_token_id = _get_lang_token_id(_ja_direct_tokenizer, KO_TARGET_LANG_CODE)
    if target_token_id is None:
        log.warning("Japanese direct model missing target lang id for %s", KO_TARGET_LANG_CODE)
        return None

    try:
        _ja_direct_tokenizer.src_lang = JA_SOURCE_LANG_CODE
        inputs = _ja_direct_tokenizer(
            [text],
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=512,
        )
        translated = _ja_direct_model.generate(
            **inputs,
            forced_bos_token_id=target_token_id,
            num_beams=4,
            max_length=512,
        )
        result = _ja_direct_tokenizer.batch_decode(translated, skip_special_tokens=True)
        return _normalize_text_for_display(result[0]) if result else None
    except Exception as exc:
        log.warning("Japanese direct translate error: %s", exc)
        return None


def _translate_ja_direct_in_chunks(text: str) -> Optional[str]:
    chunks = _split_translation_chunks(text)
    if not chunks:
        return ""

    translated_chunks: list[str] = []
    for chunk in chunks:
        translated = _ja_direct_translate_once(chunk)
        if translated is None:
            return None
        translated_chunks.append(translated)

    merged = " ".join(part for part in translated_chunks if part)
    return _normalize_text_for_display(merged)


def _get_argos_translation(src_lang: str, dst_lang: str):
    src = _argos_languages.get(src_lang)
    dst = _argos_languages.get(dst_lang)
    if src is None or dst is None:
        return None

    key = (src_lang, dst_lang)
    cached = _argos_translations.get(key)
    if cached is not None:
        return cached

    try:
        translator = src.get_translation(dst)
        _argos_translations[key] = translator
        return translator
    except Exception as exc:
        log.warning("Argos %s->%s translator load failed: %s", src_lang, dst_lang, exc)
        return None


def _argos_translate_once(text: str, src_lang: str, dst_lang: str) -> Optional[str]:
    translator = _get_argos_translation(src_lang, dst_lang)
    if translator is None:
        return None

    try:
        translated = translator.translate(text)
        return _normalize_text_for_display(translated)
    except Exception as exc:
        log.warning("Argos %s->%s error: %s", src_lang, dst_lang, exc)
        return None


def _translate_with_argos(text: str, src_lang: str, target_lang: str) -> Optional[str]:
    chunks = _split_translation_chunks(text)
    if not chunks:
        return ""

    translated_chunks: list[str] = []
    for chunk in chunks:
        translated = _argos_translate_once(chunk, src_lang, target_lang)
        if translated is None and src_lang != "en":
            bridged_english = _argos_translate_once(chunk, src_lang, "en")
            if bridged_english is not None:
                translated = _argos_translate_once(bridged_english, "en", target_lang)

        if translated is None:
            return None

        translated_chunks.append(translated)

    merged = " ".join(part for part in translated_chunks if part)
    return _normalize_text_for_display(merged)


def _is_short_fragment(text: str, lang: Optional[str]) -> bool:
    """True if the text is too short to be meaningful."""
    normalized = _normalize_text_for_display(text)
    if not normalized:
        return True
    if lang in CJK_LANGS or _is_cjk(normalized):
        # CJK: filter if fewer than 6 characters (excludes punctuation)
        char_count = sum(1 for c in normalized if not unicodedata.category(c).startswith("P"))
        return char_count < 6
    # Space-separated: filter if fewer than 2 words
    return len(normalized.split()) < 2


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
        "translation_ready": _argos_ready or _mt_ready or _ja_direct_ready,
        "translation_engines": {
            "argos": _argos_ready,
            "ja_direct": _ja_direct_ready,
            "marian": _mt_ready,
        },
        "ja_translation": {
            "mode": JA_TRANSLATION_MODE,
            "direct_model": JA_DIRECT_MODEL,
            "direct_ready": _ja_direct_ready,
        },
        "language_hint_mode": LANGUAGE_HINT_MODE,
        "translation_langs": {
            "argos": sorted(_argos_languages.keys()),
            "ja_direct": ["ja", "ko"] if _ja_direct_ready else [],
            "marian": sorted(_mt_models.keys()),
        },
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

    language_hint = req.language.strip().lower() if req.language else None
    if language_hint:
        detected_lang = language_hint
    else:
        _, probe = _whisper_model.transcribe(samples, language=None, beam_size=1, vad_filter=False)
        detected_lang = probe.language if probe else "en"

    # When language is explicitly selected, keep that language path fixed.
    if language_hint:
        task = "transcribe"
        use_translate = False
    # English/Japanese/Korean are handled as direct transcription to preserve source meaning.
    elif detected_lang in {"en", "ja", "ko"}:
        task = "transcribe"
        use_translate = False
    else:
        # Unknown/other languages fall back to Whisper translate→English path.
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
    transcript = _normalize_text_for_display(transcript)
    transcript = _apply_language_hint_guard(transcript, language_hint)

    # If Whisper was supposed to translate (non-English) but still output CJK chars,
    # the translation failed — drop the transcript to avoid garbage output.
    if use_translate and transcript and _is_cjk(transcript):
        log.info("Whisper translate failed (CJK in output, lang=%s): %r", detected_lang, transcript[:60])
        transcript = ""

    # Short fragment filter (language-aware)
    short_fragment_lang = "en" if use_translate else (language_hint or detected_lang)
    if _is_short_fragment(transcript, short_fragment_lang):
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
    normalized_text = _normalize_text_for_display(req.text)
    if not normalized_text:
        return TranslateResponse(translatedText="")

    src = (req.source_lang or "en").strip().lower()

    # Only explicit Korean source is passthrough.
    if req.target_lang == "ko" and src == "ko":
        return TranslateResponse(translatedText=normalized_text)

    # In locked English/Japanese sessions, drop obvious Korean transcript bleed-through.
    if src in {"en", "ja"} and _contains_hangul(normalized_text):
        log.info("Dropped Hangul transcript in locked %s source: %r", src, normalized_text[:80])
        return TranslateResponse(translatedText="")

    if not (_argos_ready or _mt_ready or _ja_direct_ready):
        raise HTTPException(503, "Translation model not ready.")

    if src == "ja" and req.target_lang == "ko" and _is_cjk(normalized_text):
        if JA_TRANSLATION_MODE in {"auto", "direct"}:
            result = _translate_ja_direct_in_chunks(normalized_text)
            if result is not None:
                return TranslateResponse(translatedText=result)
            if JA_TRANSLATION_MODE == "direct":
                raise HTTPException(422, "Direct ja->ko translation failed.")

        result = _translate_with_argos(normalized_text, "ja", req.target_lang)
        if result is not None:
            return TranslateResponse(translatedText=result)

        raise HTTPException(422, "No ja->ko translation path available.")

    # Japanese session that produced English text should try en->ko first.
    if src == "ja" and not _is_cjk(normalized_text):
        candidate_sources = ["en", "ja"]
    else:
        candidate_sources = [src]
        if src != "en" and not _is_cjk(normalized_text):
            candidate_sources.append("en")

    for candidate_src in dict.fromkeys(candidate_sources):
        result = _translate_with_argos(normalized_text, candidate_src, req.target_lang)
        if result is not None:
            return TranslateResponse(translatedText=result)

    for candidate_src in dict.fromkeys(candidate_sources):
        result = _translate_in_chunks(normalized_text, candidate_src)
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
