# Step 32 Checkpoint (2026-04-29)

## Goal
Stabilize desktop sidecar startup (`local-ai`, `realtime`, `pipeline`) and remove startup races causing:
- `realtime` `EADDRINUSE` on `127.0.0.1:8787`
- `local-ai` dropping before `/health` becomes ready

## Changes Applied

### 1) Realtime double-start fix
- File: `services/realtime/src/server.ts`
- Removed top-level auto-start block.
- `src/entry.ts` is now the single owner of runtime startup.
- Why: bundled sidecar could trigger two startup paths and cause `EADDRINUSE`.

### 2) Desktop sidecar startup hardening
- File: `apps/desktop/src-tauri/src/lib.rs`
- Port ownership strategy on startup:
  - detect listeners on `8787/8788/8789`
  - kill stale PID listeners by port before spawning
  - brief wait for socket release
- Added startup diagnostics:
  - in-memory log + `%TEMP%\\sorisori-startup.log`
  - sidecar stderr lines for realtime/pipeline are mirrored into that file
- Added local-ai early life guard:
  - `ensure_child_stays_up("local-ai", ..., 1400ms)`
- Set `PYTHONUNBUFFERED=1` for local-ai launch.
- Critical stability tweak:
  - local-ai stdio changed to `stdout=null`, `stderr=null` (no pipe attach), because piped capture path was unstable for onefile local-ai on this machine.
- Window-destroy cleanup narrowed:
  - kill sidecars only when destroyed window label is `main`.
  - log destroyed window labels for debugging.

## Verification Done (local)

### Process/health timeline (desktop launch)
- `local-ai` appears at ~2s
- `/health` at `8789` becomes `ok` around ~10s
- `realtime` and `pipeline` both `ok`

### No realtime bind collision
- No more `EADDRINUSE` in `%TEMP%\\sorisori-startup.log` after sidecar rebuild.

## Build Artifacts
- NSIS installer rebuilt:
  - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
  - last built: `2026-04-29 11:33` (local time)

