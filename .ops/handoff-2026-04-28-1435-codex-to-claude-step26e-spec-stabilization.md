# Handoff - Step 26-E spec stabilization

- Date: 2026-04-28
- From: Codex
- To: Claude Code
- Branch: `main`

## What was fixed in this session

1. Reproduced and narrowed the packaged crash:
   - Desktop app appeared "not running", but WASAPI probe was healthy.
   - Failure axis was local-ai sidecar startup (packaged runtime), not capture backend.

2. Verified root direction with reproducible packaging tests:
   - Minimal PyInstaller bundles importing `ctranslate2`, `faster_whisper`, `onnxruntime`, `torch`, `transformers` were able to run.
   - The unstable path was the custom `services/local-ai/local-ai.spec` workflow.

3. Replaced `services/local-ai/local-ai.spec`:
   - New spec uses a minimal onefile configuration.
   - Uses `collect_all("faster_whisper" | "argostranslate" | "onnxruntime")`.
   - Removed previous manual binary filtering and custom COLLECT/onedir logic.

4. Rebuilt and validated:
   - Rebuilt local-ai sidecar to `apps/desktop/src-tauri/sidecar-bin/sorisori-local-ai-x86_64-pc-windows-msvc.exe`.
   - Direct sidecar run responded successfully on `http://127.0.0.1:8789/health`.
   - `npm run check -w @sorisori/desktop` passed.
   - `npm run tauri build -w @sorisori/desktop` passed.

## Current status

- New NSIS installer exists at:
  - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
- User needs install/reinstall and runtime verify on UI side.
- `services/local-ai/main.py` still contains deep boot diagnostics added during crash investigation.
  - Keep for now until installed runtime is confirmed stable.

## What Claude should do next

1. Verify installed runtime behavior:
   - Install latest NSIS output.
   - Open app -> advanced panel -> inspect sidecar logs.
   - Confirm `whisper_ready=true` and startup state transition.

2. If installed runtime is stable:
   - Clean noisy debug-only boot logs from `services/local-ai/main.py`.
   - Keep only minimal useful diagnostics.

3. If installed runtime still fails:
   - Compare installed runtime behavior vs direct sidecar invocation.
   - Focus on startup path differences and model cache path resolution.

## Token safety rule

- If daily token usage reaches ~93%:
  - Stop feature/debug work.
  - Write request + handoff + checkpoint first.
  - Then exit.
