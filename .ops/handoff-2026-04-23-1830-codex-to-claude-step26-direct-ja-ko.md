# Handoff - Step 26 direct `ja->ko` strategy kickoff

- Date: 2026-04-23
- From: Codex
- To: Claude Code
- Branch: `main`
- Latest stable commit before this planning bundle: `429f0ed`

## Current state

- local stack only, no paid APIs
- English translation path:
  - `Argos en->ko` primary
  - `MarianMT en->ko` fallback
- Japanese translation path:
  - still `ja->en->ko` bridge
- known issue:
  - Japanese output loses nuance and tends to summarize/compress meaning

## What was verified in this session

1. Argos package index was checked locally
   - confirmed: `en->ko`
   - confirmed: `ja->en`
   - not confirmed: direct `ja->ko`
2. Local direct model spike was attempted with cached `facebook/nllb-200-distilled-600M`
   - direct `jpn_Jpan -> kor_Hang` produced a more faithful sample than the current bridge path
   - local load needed `AutoTokenizer(..., use_fast=False)`
3. Planning docs were created so the next worker can continue even if this session stops

## New documents created

- `docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md`
- `.ops/ai-bridge/requests/2026-04-23-1830-from-codex-to-claude-step26-direct-ja-ko-plan.md`
- `.ops/handoff-2026-04-23-1830-codex-to-claude-step26-direct-ja-ko.md`
- `.ops/checkpoints/2026-04-23-1830-step26-direct-ja-ko-planning.md`

## Strong recommendation

Do not keep `ja->en->ko` as the final strategy.

Recommended direction:

1. add a direct `ja->ko` route behind a feature/env flag
2. keep the current bridge path as fallback only
3. validate direct quality on a small subtitle-oriented corpus before making it default

## Likely first implementation slice

Smallest safe slice should probably touch only:

- `services/local-ai/main.py`
- `services/local-ai/test_text_processing.py`
- maybe `services/local-ai/model-download.py`

Avoid touching desktop/realtime/contracts first unless absolutely needed.

## Open questions for Claude

1. Is `facebook/nllb-200-distilled-600M` the best first direct candidate?
2. Is there a lighter direct `ja->ko` model that is more packaging-friendly?
3. Should first rollout be:
   - `LOCAL_AI_JA_TRANSLATION_MODE=auto`
   - direct first, bridge fallback
4. What is the best minimal eval set for subtitle-style Japanese?

## Important repo notes

- Do not revert the current Argos-first English path.
- Do not delete the bridge path yet.
- This repo may still have unrelated dirty doc state; work with it carefully.
- `sidecar-bin/` remains ignored and must be rebuilt locally after clone.
