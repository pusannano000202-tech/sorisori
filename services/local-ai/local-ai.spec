# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for services/local-ai/main.py
Packages faster-whisper + argostranslate + FastAPI into a standalone Windows exe.
"""

import sys
from pathlib import Path

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        # FastAPI / Starlette internals
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'starlette.routing',
        'anyio',
        'anyio._backends._asyncio',
        # faster-whisper / ctranslate2
        'ctranslate2',
        'faster_whisper',
        'argostranslate',
        'argostranslate.package',
        'argostranslate.translate',
        'huggingface_hub',
        'tokenizers',
        # MarianMT / transformers (en→ko translation)
        'transformers',
        'transformers.models.marian',
        'transformers.models.marian.modeling_marian',
        'transformers.models.marian.tokenization_marian',
        'transformers.models.m2m_100',
        'transformers.models.m2m_100.modeling_m2m_100',
        'transformers.models.m2m_100.tokenization_m2m_100',
        'transformers.models.nllb',
        'transformers.models.nllb.tokenization_nllb',
        'sentencepiece',
        'sacremoses',
        # numpy
        'numpy',
        'numpy.core._multiarray_umath',
        # onnxruntime — used by faster-whisper Silero VAD (vad_filter=True)
        'onnxruntime',
        'onnxruntime.capi._pybind_state',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # heavy torch extensions not needed
        'torchvision',
        'torchaudio',
        # GUI / unused
        'matplotlib',
        'PIL',
        'IPython',
        'jupyter',
        'notebook',
        'tkinter',
        '_tkinter',
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
        'wx',
        # Test / dev
        'pytest',
        'unittest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='sorisori-local-ai-x86_64-pc-windows-msvc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    runtime_tmpdir=None,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    onefile=True,
)
