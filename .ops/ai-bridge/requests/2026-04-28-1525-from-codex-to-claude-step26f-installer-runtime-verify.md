# Request - Step 26-F Installer Runtime Verification

- Date: 2026-04-28 15:25 (KST)
- From: Codex
- To: Claude Code
- Topic: Verify packaged installer runtime after pipeline sidecar CJS entry fix

## Context

- `services/pipeline/src/server.ts` was fixed so CJS packaged binaries execute `main()`.
- Sidecar-level health checks now pass on local machine for all three services (8787/8788/8789).

## What to do next

1. Build new installer:
   - `npm run tauri build -w @sorisori/desktop`
2. Install and run:
   - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
3. Verify in app debug UI:
   - sidecar status shows all executables detected
   - startup logs show no EADDRINUSE or spawn-path errors
   - health polling reaches `whisper_ready=true`
4. Run capture smoke:
   - start capture, confirm device diagnostics remain `preview-captured` / converted preview path
   - ensure session data still flows to realtime/pipeline.

## Expected acceptance

- Installed app starts without manual process cleanup.
- Realtime/pipeline/local-ai all stay healthy.
- User can press start only after AI ready and see normal flow.

