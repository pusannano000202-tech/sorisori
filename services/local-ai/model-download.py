"""Download faster-whisper + Argos/Marian translation models for local-ai."""

from __future__ import annotations

import os
import sys

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
MODELS_DIR = os.environ.get(
    "MODELS_DIR",
    os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "sorisori", "models"),
)
MARIAN_MODELS = {
    "en": "Helsinki-NLP/opus-mt-tc-big-en-ko",
}


def download_whisper():
    print(f"[model-download] Downloading faster-whisper '{MODEL_SIZE}' to {MODELS_DIR} ...")
    from faster_whisper import WhisperModel  # type: ignore[import-untyped]
    WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", download_root=MODELS_DIR)
    print("[model-download] faster-whisper model ready.")


ARGOS_PACKS = [
    ("en", "ko"),  # English → Korean (primary)
    ("ja", "en"),  # Japanese → English (bridge for ja→en→ko)
]


def download_argos():
    import argostranslate.package  # type: ignore[import-untyped]

    print("[model-download] Refreshing Argos package index ...")
    argostranslate.package.update_package_index()

    installed = {
        (pkg.from_code, pkg.to_code) for pkg in argostranslate.package.get_installed_packages()
    }
    available = argostranslate.package.get_available_packages()

    for from_code, to_code in ARGOS_PACKS:
        if (from_code, to_code) in installed:
            print(f"[model-download] Argos {from_code}->{to_code} already installed.")
            continue

        package = next(
            (pkg for pkg in available if pkg.from_code == from_code and pkg.to_code == to_code),
            None,
        )
        if package is None:
            raise RuntimeError(f"Argos package not found: {from_code}->{to_code}")

        print(f"[model-download] Downloading Argos {from_code}->{to_code} ...")
        package_path = package.download()
        argostranslate.package.install_from_path(package_path)
        print(f"[model-download] Argos {from_code}->{to_code} ready.")


def download_marian():
    from transformers import MarianMTModel, MarianTokenizer  # type: ignore[import-untyped]

    cache_dir = os.path.join(MODELS_DIR, "marian")
    os.makedirs(cache_dir, exist_ok=True)

    for lang_code, model_name in MARIAN_MODELS.items():
        print(f"[model-download] Downloading MarianMT {lang_code}→ko model: {model_name}")
        MarianTokenizer.from_pretrained(model_name, cache_dir=cache_dir)
        MarianMTModel.from_pretrained(model_name, cache_dir=cache_dir)
        print(f"[model-download] MarianMT {lang_code}→ko ready.")


if __name__ == "__main__":
    try:
        download_whisper()
        download_argos()
        download_marian()
        print("[model-download] All models ready.")
    except Exception as exc:
        print(f"[model-download] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
