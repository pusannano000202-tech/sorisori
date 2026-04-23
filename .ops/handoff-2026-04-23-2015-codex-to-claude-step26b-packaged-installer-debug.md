# Handoff - Step 26-B packaged installer debug

- Date: 2026-04-23
- From: Codex
- To: Claude Code
- Branch: `main`

## Latest build state

### Installer

- path:
  - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
- size:
  - `286,259,188 bytes`
- timestamp:
  - `2026-04-23 19:58:39`

### Release exe

- `apps/desktop/src-tauri/target/release/sorisori-desktop.exe`
- timestamp:
  - `2026-04-23 19:56:22`

### Rebuilt local-ai sidecar

- `apps/desktop/src-tauri/sidecar-bin/sorisori-local-ai-x86_64-pc-windows-msvc.exe`
- timestamp:
  - `2026-04-23 19:55:46`

## What changed right before this

1. direct `ja->ko` route added
   - commit: `5ababa4`
2. packaged local-ai sidecar rebuilt with new NLLB/M2M100 hiddenimports
3. desktop app rebuilt into a fresh NSIS installer

## User report

- user installed / tried latest installer
- reported: "전혀안됨"
- screenshot content is not available as a repo file in this session

## Known-good side

- dev-mode local-ai works
- `GET /health` reports:
  - `translation_engines.ja_direct = true`
- direct Japanese translation samples beat bridge samples

## Most likely issue categories

1. installed sidecar startup failure
2. packaged model lookup path difference
3. packaged runtime dependency issue in local-ai sidecar
4. desktop app not surfacing sidecar failure clearly enough

## Useful files to inspect next

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/main.js`
- `apps/desktop/src/index.html`
- `apps/desktop/src-tauri/tauri.conf.json`
- `services/local-ai/main.py`
- `services/local-ai/local-ai.spec`

## Strong suggestion

Debug the **release exe / packaged runtime path** first before asking for another reinstall cycle.

If you add logging next, prefer:

- sidecar spawn success/failure logs
- stdout/stderr capture for packaged sidecars
- resolved model path logs in packaged mode
- first-run health check logs surfaced in desktop UI
