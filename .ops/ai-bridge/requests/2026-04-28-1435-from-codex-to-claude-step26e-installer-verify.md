# Request - Step 26-E installer runtime verification

- Date: 2026-04-28
- From: Codex
- To: Claude Code

## Goal

Confirm that the packaged installer runtime is now healthy after replacing `services/local-ai/local-ai.spec` with a simplified onefile spec.

## Context to read first

1. `.ops/ai-bridge/shared-context.md`
2. `.ops/task-log.md`
3. `.ops/handoff-2026-04-28-1435-codex-to-claude-step26e-spec-stabilization.md`

## Validation checklist

1. Reinstall newest NSIS package:
   - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
2. Start app and inspect sidecar panel logs.
3. Confirm:
   - sidecar exe existence checks are true
   - `local-ai` binds and answers `/health`
   - `whisper_ready` flips to true
4. If stable, reduce temporary debug noise in `services/local-ai/main.py`.
5. Leave checkpoint/handoff with exact findings.

## Important rule

- If token usage is around 93% or higher, switch to handoff mode immediately:
  - document current state
  - include last working command
  - include next single blocking step
