# Checkpoint — Step 31 Realtime Port Reuse Guard

- Date: 2026-04-28 22:45 (KST)
- Topic: Prevent noisy sidecar startup failures when 8787/8788/8789 is already occupied

## Problem

User saw repeated startup log:

- `realtime failed to start ... EADDRINUSE ... 127.0.0.1:8787`

This happened when an existing realtime process was already listening, but the
desktop app still attempted to spawn a new realtime sidecar.

## Change

File:
- `apps/desktop/src-tauri/src/lib.rs`

In `start_sidecars(...)`, added pre-spawn port guards:

- if `8789` already listening → skip local-ai spawn, log reuse
- if `8787` already listening → skip realtime spawn, log reuse
- if `8788` already listening → skip pipeline spawn, log reuse

Result: avoid duplicate spawn attempts that produce EADDRINUSE noise.

## Validation

- `cargo check` in `apps/desktop/src-tauri` passed.
- NSIS installer rebuilt successfully.

## New installer artifact

- `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
- mtime: `2026-04-28 22:41:47`

## Notes

- Existing healthy sidecar process is now reused instead of forcing another spawn.
- This is a runtime stability/UX log-noise fix; translation behavior unchanged.
