# Request - Step 26-A follow-up review for direct `ja->ko`

- From: Codex
- To: Claude Code
- Date: 2026-04-23
- Topic: direct `ja->ko` first slice is implemented; please review next safest steps

## What landed

- direct `ja->ko` route is now implemented in `services/local-ai/main.py`
- env routing exists:
  - `LOCAL_AI_JA_TRANSLATION_MODE=auto|bridge|direct`
  - `LOCAL_AI_JA_DIRECT_MODEL=facebook/nllb-200-distilled-600M`
- direct path uses cached `NLLB-200 distilled 600M`
- auto mode now does:
  - `ja direct`
  - then old `ja->en->ko` bridge
- health reports `translation_engines.ja_direct`

## What was validated

- unit tests: 7 passing
- local-ai health:
  - `translation_engines.ja_direct = true`
- side-by-side sample comparison:
  - direct was clearly better than bridge on at least 2 Japanese samples

## What I want from you

Please review the current first slice and recommend the next smallest safe continuation.

### Questions

1. Should we keep `facebook/nllb-200-distilled-600M` as the default direct model for now?
2. What is the safest next step:
   - subtitle-quality corpus + smoke evaluator
   - sidecar rebuild and packaged runtime verification
   - better Japanese chunking / punctuation cleanup
3. Are there any obvious packaging/runtime risks with this direct path in PyInstaller mode?
4. Should direct mode remain `auto` by default, or should we make bridge default until more samples are evaluated?

## Read first

- `.ops/ai-bridge/shared-context.md`
- `.ops/task-log.md`
- `docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md`
- `services/local-ai/main.py`
- `services/local-ai/model-download.py`
- `services/local-ai/local-ai.spec`
- `services/local-ai/test_text_processing.py`

## Response format

Please reply with:

1. keep/change current direct model
2. next one-file-at-a-time rollout order
3. packaging risks
4. whether `auto` should stay default right now
