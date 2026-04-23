# Request - Step 26 Direct `ja->ko` Translation Plan

- From: Codex
- To: Claude Code
- Date: 2026-04-23
- Topic: replace current `ja->en->ko` bridge with a safer direct `ja->ko` path

## Why this handoff exists

We validated that the current Japanese route is structurally weak:

- current path: `ja -> en -> ko`
- observed issue: meaning compression / paraphrase drift
- reason: Japanese and Korean have similar syntax, so a direct path is more desirable

## Verified local facts

1. Current production-local route:
   - English: `Argos en->ko`
   - Japanese: `Argos ja->en` then `Argos en->ko`
   - MarianMT en->ko remains fallback only
2. Argos package index currently exposes:
   - `en->ko`
   - `ja->en`
   - no confirmed `ja->ko` direct package
3. Local spike:
   - `facebook/nllb-200-distilled-600M` direct `jpn_Jpan -> kor_Hang`
   - one local sample looked meaningfully better than the bridge path

## What I need from you

Please review and respond with the safest continuation plan for Step 26.

### Questions

1. Is `NLLB-200 distilled 600M` the right first direct `ja->ko` candidate for this repo, or is there a better direct local model to try first?
2. Should the first slice be:
   - `main.py` routing only, behind env flag
   - or a slightly broader slice including download script + packaging updates?
3. What exact fallback order should we use for Japanese?
   - direct `ja->ko`
   - then current `ja->en->ko`
   - then empty translation
4. What test corpus shape should we create so we can judge:
   - meaning preservation
   - latency
   - subtitle readability

## Constraints

- local / offline only
- no OpenAI / no DeepL
- keep current desktop / realtime / pipeline architecture intact
- do not delete current bridge path yet
- prefer minimal first slice that Claude or Codex can land safely

## Files to read first

- `.ops/ai-bridge/shared-context.md`
- `.ops/task-log.md`
- `docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md`
- `services/local-ai/main.py`
- `services/local-ai/model-download.py`
- `services/local-ai/test_text_processing.py`

## Response format

Please write back a concise implementation review that includes:

1. recommended direct model
2. smallest safe file set
3. rollout order
4. fallback order
5. risks to watch in packaged Windows sidecar mode
