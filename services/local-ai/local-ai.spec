# -*- mode: python ; coding: utf-8 -*-
"""
Stable onefile spec for local-ai sidecar.

This intentionally keeps the packaging logic minimal:
- let PyInstaller infer imports from main.py
- explicitly collect runtime assets for faster_whisper, argostranslate, onnxruntime
"""

from PyInstaller.utils.hooks import collect_all


datas = []
binaries = []
hiddenimports = []

for package_name in ("faster_whisper", "argostranslate", "onnxruntime"):
    package_datas, package_binaries, package_hiddenimports = collect_all(package_name)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports


a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=["runtime_hook_stub_torch.py"],
    excludes=[
        "torch",
        "torchvision",
        "torchaudio",
        "tensorflow",
        "keras",
        "triton",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="sorisori-local-ai-x86_64-pc-windows-msvc",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
