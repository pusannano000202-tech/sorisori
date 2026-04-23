- Date: 2026-04-23
- Topic: Step 26 kickoff - direct Japanese-to-Korean translation planning

## Summary

- Identified current Japanese translation path as the next weak point.
- Confirmed current route is still `ja->en->ko`.
- Verified locally that Argos currently offers `ja->en` and `en->ko`, but no visible direct `ja->ko` package.
- Verified a cached `facebook/nllb-200-distilled-600M` direct `ja->ko` sample looked better than the bridge path.
- Wrote planning + handoff docs so Claude or Codex can continue from this point safely.

## Files Created / Updated

- `docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md`
- `.ops/ai-bridge/requests/2026-04-23-1830-from-codex-to-claude-step26-direct-ja-ko-plan.md`
- `.ops/handoff-2026-04-23-1830-codex-to-claude-step26-direct-ja-ko.md`
- `.ops/checkpoints/2026-04-23-1830-step26-direct-ja-ko-planning.md`
- `.ops/ai-bridge/shared-context.md`
- `.ops/task-log.md`

## Next Best Step

- Claude reviews the direct `ja->ko` candidate strategy and returns the safest minimal file set.
- After that, implement a feature-flagged direct route in `services/local-ai/main.py`.
