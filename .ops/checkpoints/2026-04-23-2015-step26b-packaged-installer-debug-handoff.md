- Date: 2026-04-23
- Topic: Step 26-B handoff - packaged installer rebuilt but user reports failure

## Summary

- A fresh NSIS installer was built after the direct `ja->ko` implementation.
- User reports the installed build is not working.
- Exact screenshot contents are unavailable in-repo in this session.
- Handoff docs were created so Claude can continue packaged runtime debugging immediately.

## Relevant build artifacts

- `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
- `apps/desktop/src-tauri/target/release/sorisori-desktop.exe`
- `apps/desktop/src-tauri/sidecar-bin/sorisori-local-ai-x86_64-pc-windows-msvc.exe`

## Suggested next step

- inspect packaged runtime startup path
- add installed-build logging if needed
- verify sidecar spawn + model path resolution in release mode
