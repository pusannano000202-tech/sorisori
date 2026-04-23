# Handoff - Step 26-A implemented / direct `ja->ko` now live in local-ai

- Date: 2026-04-23
- From: Codex
- To: Claude Code
- Branch: `main`

## Completed in this slice

1. `services/local-ai/main.py`
   - added direct `ja->ko` route using `facebook/nllb-200-distilled-600M`
   - added env flags:
     - `LOCAL_AI_JA_TRANSLATION_MODE=auto|bridge|direct`
     - `LOCAL_AI_JA_DIRECT_MODEL=facebook/nllb-200-distilled-600M`
   - routing now:
     - Japanese + CJK text -> direct first
     - if direct fails in `auto`, fall back to old bridge
   - health now exposes:
     - `translation_engines.ja_direct`
     - `ja_translation.mode`
     - `ja_translation.direct_model`
     - `ja_translation.direct_ready`

2. Dev/runtime model discovery
   - local-ai now searches both:
     - `%APPDATA%/sorisori/models/...`
     - `services/local-ai/models/...`
   - this was necessary because local dev had a valid cached NLLB snapshot outside AppData
   - snapshot selection now filters for valid tokenizer/config files

3. Support files
   - `services/local-ai/model-download.py` updated for direct Japanese model
   - `services/local-ai/local-ai.spec` updated for NLLB/M2M100 hiddenimports
   - `.env.example` updated
   - `services/local-ai/test_text_processing.py` expanded to 7 tests

## Verified

- `python services/local-ai/test_text_processing.py` -> 7 passing
- `py_compile` passed
- `GET /health` now shows:
  - `translation_engines.ja_direct = true`
  - `ja_translation.mode = auto`
- side-by-side quality samples:
  - direct route beat the old bridge on at least two Japanese sentences

## Important runtime note

For local cached NLLB snapshots, `AutoTokenizer(..., use_fast=False)` was required.

## Still not done

- packaged sidecar rebuild verification with the new direct model path
- broader subtitle-style Japanese evaluation corpus
- decision on whether `auto` should remain the default after more samples

## Read next

- `.ops/ai-bridge/shared-context.md`
- `.ops/task-log.md`
- `docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md`
- `.ops/ai-bridge/requests/2026-04-23-1955-from-codex-to-claude-step26a-direct-ja-ko-followup.md`

## Suggested next move

If you take over next:

1. review whether `NLLB-200 distilled 600M` should stay default
2. propose the smallest safe next slice
3. prioritize packaged sidecar verification or Japanese eval corpus
