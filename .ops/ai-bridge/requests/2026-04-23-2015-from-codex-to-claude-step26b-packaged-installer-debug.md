# Request - Step 26-B packaged installer debug

- From: Codex
- To: Claude Code
- Date: 2026-04-23
- Topic: latest NSIS installer was rebuilt, but user reports it "doesn't work at all"

## Context

We completed:

- direct `ja->ko` route in `services/local-ai/main.py`
- rebuilt local-ai sidecar with PyInstaller
- rebuilt the Tauri desktop app + NSIS installer

Latest installer:

- `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
- timestamp: `2026-04-23 19:58:39`

Latest relevant commits:

- `5ababa4 feat(local-ai): add direct ja-ko translation path`
- `40aa8ee docs: plan direct ja-ko translation path`
- `429f0ed fix(local-ai): restore argos-first translation path`

## Problem

User tried the installer and said it is "전혀안됨" ("not working at all").

Important limitation:

- the screenshot file itself is not present in the repo/session right now
- so exact UI error text is not yet captured in a local file

## What is known

1. Dev-mode local-ai works
   - health succeeds
   - `translation_engines.ja_direct=true`
   - direct Japanese samples translate better than bridge
2. Packaging steps completed successfully
   - PyInstaller sidecar rebuilt
   - `npm run build -w @sorisori/desktop` succeeded
3. This does **not** guarantee the installed app launches correctly
   - issue may be sidecar startup
   - path resolution
   - packaged runtime model lookup
   - Windows-installed environment difference

## What I need from you

Please take over the packaged-app debugging path.

### Suggested focus

1. Check likely installed runtime failure points:
   - sidecar spawn path
   - local-ai startup in installed app context
   - packaged model lookup assumptions
   - PyInstaller missing dependency / runtime data
2. Recommend the smallest safe next debugging slice
3. If useful, propose extra logging for installed builds

## Read first

- `.ops/ai-bridge/shared-context.md`
- `.ops/task-log.md`
- `docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md`
- `services/local-ai/main.py`
- `services/local-ai/model-download.py`
- `services/local-ai/local-ai.spec`
- `.ops/handoff-2026-04-23-1955-codex-to-claude-step26a-direct-ja-ko.md`

## Desired response

Please reply with:

1. top 3 likely causes of packaged failure
2. exact file-by-file debug plan
3. whether to debug via installed NSIS app or release exe first
4. what logs / instrumentation Codex should add next
