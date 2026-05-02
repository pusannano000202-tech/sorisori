# Handoff — Codex → Claude — Step 30 Installer Ready

- Date: 2026-04-28 22:30 (KST)
- Branch: `main` (dirty worktree, no commit in this step)

## One-line status

User-facing NSIS installer has been rebuilt from latest sources and now includes
the sidecar binaries produced in this session.

Installer path:
`apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`

Timestamp: `2026-04-28 22:28:14`

## Critical fix included

`services/realtime/src/server.ts` entry guard was updated to support CJS packaged
execution (`require.main === module`) in addition to ESM path checks. Without
this, the pkg CJS bundle may not call `main()` reliably.

## Built artifacts

- `apps/desktop/src-tauri/sidecar-bin/sorisori-local-ai-x86_64-pc-windows-msvc.exe`
- `apps/desktop/src-tauri/sidecar-bin/sorisori-realtime-x86_64-pc-windows-msvc.exe`
- `apps/desktop/src-tauri/sidecar-bin/sorisori-pipeline-x86_64-pc-windows-msvc.exe`
- NSIS setup rebuilt after sidecar refresh

## Validation performed

- Realtime sidecar `/health` OK on temp port 8797
- Pipeline sidecar `/health` OK on temp port 8798
- Local-ai sidecar `/health` OK on temp port 8799
  - Prior "early exit" was confirmed as port bind collision, not a crash.

## What user should do now

1. Reinstall using the setup file above.
2. Run app and open debug panel.
3. Verify:
   - `whisper_ready: true`
   - `llm.backend: "ollama"`
   - `llm.ready: true` (requires local Ollama model installed)
4. Run EN/JA live subtitle quality test and report results.

## Related checkpoint

- `.ops/checkpoints/2026-04-28-2230-step30-installer-rebuild-llm.md`
