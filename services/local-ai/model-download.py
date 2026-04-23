"""Download faster-whisper model and Argos en→ko language pack."""

from __future__ import annotations

import os
import sys

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
MODELS_DIR = os.environ.get(
    "MODELS_DIR",
    os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "sorisori", "models"),
)


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
    import argostranslate.translate  # type: ignore[import-untyped]

    installed = argostranslate.translate.get_installed_languages()
    installed_pairs = {
        (lang.code, t.to_lang.code)
        for lang in installed
        for t in lang.translations_to
    }

    needs_update = any(pair not in installed_pairs for pair in ARGOS_PACKS)
    if needs_update:
        argostranslate.package.update_package_index()

    available = argostranslate.package.get_available_packages()

    for from_code, to_code in ARGOS_PACKS:
        if (from_code, to_code) in installed_pairs:
            print(f"[model-download] Argos {from_code}→{to_code} already installed.")
            continue
        pack = next((p for p in available if p.from_code == from_code and p.to_code == to_code), None)
        if pack is None:
            print(f"[model-download] WARNING: Argos {from_code}→{to_code} pack not found.")
            continue
        print(f"[model-download] Downloading Argos {from_code}→{to_code} ...")
        argostranslate.package.install_from_path(pack.download())
        print(f"[model-download] Argos {from_code}→{to_code} installed.")


if __name__ == "__main__":
    try:
        download_whisper()
        download_argos()
        print("[model-download] All models ready.")
    except Exception as exc:
        print(f"[model-download] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
