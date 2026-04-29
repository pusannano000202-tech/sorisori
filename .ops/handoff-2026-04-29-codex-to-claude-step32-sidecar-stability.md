# Codex → Claude Handoff (Step 32, 2026-04-29)

## What was broken
1. `realtime` sidecar frequently logged `EADDRINUSE` on `8787`.
2. Desktop app often stuck at "AI 시작 대기중..." because `local-ai` died early.

## Root causes identified
1. `realtime` double-start path:
   - `services/realtime/src/entry.ts` starts server.
   - `services/realtime/src/server.ts` also had top-level auto-start.
   - In bundled sidecar context this can trigger duplicate listen attempts.
2. `local-ai` sidecar was unstable when launched by desktop with stdio pipe attachment.
   - In this environment, onefile local-ai is stable when stdio is not piped.

## Exact code changes

### Realtime
- `services/realtime/src/server.ts`
  - Removed top-level auto-start block.
  - Kept file as pure server module.
  - Runtime entry remains `src/entry.ts`.

### Desktop
- `apps/desktop/src-tauri/src/lib.rs`
  - Startup logging mirrored into `%TEMP%\\sorisori-startup.log`.
  - Added startup invocation line with desktop PID.
  - Added `kill_stale_sidecars` port-based cleanup for `8787/8788/8789`.
  - Added `pids_on_port` + `should_spawn_sidecar` wait-for-release guard.
  - Added `ensure_child_stays_up` guard.
  - `local-ai` launch now sets:
    - `LOCAL_AI_LLM_BACKEND=ollama`
    - `LOCAL_AI_LLM_MODEL=qwen2.5:7b-instruct-q4_K_M`
    - `LOCAL_AI_LLM_URL=http://127.0.0.1:11434`
    - `PYTHONUNBUFFERED=1`
  - `local-ai` stdio now `null/null` (not piped).
  - Sidecar kill on window close restricted to `window.label() == "main"`.
  - Added destroyed-window label trace logging.

## Verification commands used
```powershell
Get-Process sorisori-desktop,sorisori-local-ai,sorisori-realtime,sorisori-pipeline -ErrorAction SilentlyContinue | Stop-Process -Force
foreach($p in 8787,8788,8789){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
Start-Process "...\apps\desktop\src-tauri\target\release\sorisori-desktop.exe"

# observe
Invoke-RestMethod http://127.0.0.1:8787/health
Invoke-RestMethod http://127.0.0.1:8788/health
Invoke-RestMethod http://127.0.0.1:8789/health

Get-Content "$env:TEMP\sorisori-startup.log" -Tail 200
```

## Current known-good behavior
- `realtime`/`pipeline` health endpoints return `ok`.
- `local-ai` appears within a few seconds and `/health` typically returns `ok` by ~10s.
- No recent `EADDRINUSE` after rebuilding realtime sidecar.

## Build artifacts produced
- Rebuilt realtime sidecar:
  - `apps/desktop/src-tauri/sidecar-bin/sorisori-realtime-x86_64-pc-windows-msvc.exe`
- Rebuilt NSIS installer:
  - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`

## Suggested next step for Claude
1. Install latest NSIS package and validate from installed path (`AppData\\Local\\SoriSori Desktop`), not only target/release.
2. Keep `local-ai` stdio unpiped unless using a known-safe logging approach.
3. If UI still hangs occasionally, add explicit desktop-side exponential wait + user-friendly startup status messaging based on `/health`.

