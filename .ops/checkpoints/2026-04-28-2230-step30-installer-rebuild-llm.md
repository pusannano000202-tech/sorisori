# Checkpoint — Step 30 Installer Rebuild (LLM Path)

- Date: 2026-04-28 22:30 (KST)
- Topic: Rebuild sidecars + NSIS installer so packaged app includes latest local LLM wiring

## Why

User requested verification that the installer at:

`apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`

is the **latest LLM-enabled build** (not an old build).

## What was done

1. Rebuilt local-ai sidecar from current `services/local-ai/main.py`
   - Command:
     - `cd services/local-ai`
     - `.venv/Scripts/pyinstaller.exe local-ai.spec --distpath ../../apps/desktop/src-tauri/sidecar-bin --workpath build --noconfirm`
2. Rebuilt realtime sidecar
   - Command:
     - `npx esbuild services/realtime/src/entry.ts --bundle --platform=node --target=node18 --format=cjs --outfile=services/realtime/dist/bundle.cjs --external:ws`
     - `npx pkg services/realtime/dist/bundle.cjs --target node18-win-x64 --output apps/desktop/src-tauri/sidecar-bin/sorisori-realtime-x86_64-pc-windows-msvc.exe`
3. Rebuilt pipeline sidecar
   - Command:
     - `npx esbuild services/pipeline/src/server.ts --bundle --platform=node --target=node18 --format=cjs --outfile=services/pipeline/dist/bundle.cjs --external:ws --external:@prisma/client`
     - `npx pkg services/pipeline/dist/bundle.cjs --target node18-win-x64 --output apps/desktop/src-tauri/sidecar-bin/sorisori-pipeline-x86_64-pc-windows-msvc.exe`
4. Fixed realtime packaged entry guard (`services/realtime/src/server.ts`)
   - Added `isExecutedAsScript()` with CJS (`require.main === module`) + ESM fallback.
5. Rebuilt NSIS installer
   - Command:
     - `cd apps/desktop`
     - `npm run tauri build`

## Runtime verification

- `sorisori-realtime` sidecar standalone health OK (`REALTIME_PORT=8797`)
- `sorisori-pipeline` sidecar standalone health OK (`PIPELINE_PORT=8798`)
- `sorisori-local-ai` sidecar standalone health OK (`LOCAL_AI_PORT=8799`)
  - Note: if started on 8789 while already occupied, it exits with bind error (expected).

## Artifact timestamps (latest)

- `SoriSori Desktop_0.1.0_x64-setup.exe` — 2026-04-28 22:28:14
- `sorisori-local-ai-x86_64-pc-windows-msvc.exe` — 2026-04-28 22:17:36
- `sorisori-realtime-x86_64-pc-windows-msvc.exe` — 2026-04-28 22:24:53
- `sorisori-pipeline-x86_64-pc-windows-msvc.exe` — 2026-04-28 22:24:32

## Next

1. Install this exact setup file and launch app.
2. In debug panel, confirm:
   - `whisper_ready: true`
   - `llm.backend: "ollama"`
   - `llm.ready: true` (if Ollama + model installed)
3. Live test with EN/JA video and collect quality notes.

## Notes

- Changes are not committed in this step.
- Worktree was already dirty before this checkpoint; do not run cleanup/reset commands.
