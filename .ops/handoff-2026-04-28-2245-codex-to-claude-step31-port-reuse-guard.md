# Handoff — Codex → Claude — Step 31 Port Reuse Guard

- Date: 2026-04-28 22:45 (KST)
- Branch: `main` (uncommitted)

## One-line status

Handled recurring packaged-app startup issue where realtime sidecar attempted
duplicate bind on `127.0.0.1:8787` and logged EADDRINUSE.

## Code change

- `apps/desktop/src-tauri/src/lib.rs`
  - `start_sidecars(...)` now checks listening ports before spawn:
    - `8789`: local-ai
    - `8787`: realtime
    - `8788`: pipeline
  - If port already in LISTENING state, spawn is skipped and existing process
    is reused.

## Build + verify

- `cargo check` passed.
- NSIS rebuilt:
  - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
  - mtime `2026-04-28 22:41:47`

## User-facing expectation

- Fewer/no `realtime failed to start ... EADDRINUSE` messages on normal restarts.
- Startup continues by reusing existing sidecars when applicable.

## Related checkpoint

- `.ops/checkpoints/2026-04-28-2245-step31-realtime-port-reuse-guard.md`
