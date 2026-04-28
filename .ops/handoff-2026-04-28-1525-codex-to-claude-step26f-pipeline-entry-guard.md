# Handoff - Step 26-F Pipeline Sidecar Startup Fix

- Date: 2026-04-28 15:25 (KST)
- From: Codex
- To: Claude Code (fallback)
- Branch: `main`

## What was broken

- `pipeline` sidecar (`8788`) exited immediately when packaged.
- `realtime` (`8787`) and `local-ai` (`8789`) were healthy.

## Root cause

- `services/pipeline/src/server.ts` had ESM-only entry detection:
  - `import.meta.url === new URL(file://...)`
- But sidecar is built as CJS:
  - `esbuild --format=cjs` + `pkg`
- Result: `main()` never ran in packaged binary.

## Fix applied

- Added `isExecutedAsScript()` in `services/pipeline/src/server.ts`:
  - CJS path: `require.main === module`
  - ESM path: existing `import.meta.url` check
- Rebuilt pipeline sidecar:
  - `npx esbuild services/pipeline/src/server.ts --bundle --platform=node --target=node18 --format=cjs --outfile=services/pipeline/dist/bundle.cjs --external:ws --external:@prisma/client`
  - `npx pkg services/pipeline/dist/bundle.cjs --target node18-win-x64 --output apps/desktop/src-tauri/sidecar-bin/sorisori-pipeline-x86_64-pc-windows-msvc.exe`

## Validation done

- `npm run check -w @sorisori/pipeline` passed
- `npm run test -w @sorisori/pipeline` passed
- Health checks:
  - `http://127.0.0.1:8787/health` => 200
  - `http://127.0.0.1:8788/health` => 200
  - `http://127.0.0.1:8789/health` => 200

## Remaining work

1. Rebuild installer and verify on installed app path:
   - `npm run tauri build -w @sorisori/desktop`
   - Install `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
2. In app debug panel, confirm all three sidecars stay up and health polling turns ready.
3. If stable, clean diagnostic noise from `services/local-ai/main.py` before final polish.

## Important workspace notes

- Current working tree also has pre-existing uncommitted changes:
  - `apps/desktop/src-tauri/src/lib.rs`
  - `services/local-ai/main.py`
  - untracked `docs/image/`
- Do not blindly reset these; inspect before final cleanup.

