# Handoff: Codex -> Claude (Step 41 follow-up)

## Context
User requested we account for Japanese loanword usage in real speech (example: `3 percent` / `パーセント`) and continue improving JA quality.

## What is done
- Implemented JA loanword-aware evaluation matching.
- Implemented JA keyword policy emphasizing numeric + katakana anchors.
- Rebuilt external manifests/corpus and reran full quality gate.

## Modified files
- `services/local-ai/eval/run_stt_eval.py`
- `services/local-ai/eval/build_stt_dataset.py`
- `services/local-ai/eval/populate_external_sources_auto.py`
- `.ops/checkpoints/2026-04-30-step41-ja-loanword-normalization-and-gate.md`

## Latest measured result
- `services/local-ai/eval/reports/stt-gate-20260430-232727.json`
- EN/JA gate status: PASS
  - EN: 90.30
  - JA: 79.80
- JA per source:
  - `human_external`: 82.61
  - `music_mixed`: 69.49

## Key blocker
- Strict target requested by user (`JA human_external >= 85` and `JA music_mixed >= 85`) is not met.
- Main bottleneck remains music-mixed JA STT quality, not just keyword policy.

## Recommended next actions (in order)
1. **JA-only model replacement spike (preferred)**
   - Add separate JA STT model route (`WHISPER_MODEL_JA`) with fallback to base model.
   - Candidate: `large-v3` for JA only.
2. **A/B eval harness**
   - Keep EN model fixed as current baseline.
   - Run JA-only eval with new model and compare:
     - JA overall
     - JA human_external
     - JA music_mixed
3. **If still below 85 on music_mixed**
   - Add denoise/pre-emphasis preprocessor only on JA music_mixed eval path (not global) and re-check.

## Re-run commands
1. `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/populate_external_sources_auto.py`
2. `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py`
3. `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py`

## Notes
- Existing unrelated dirty/untracked workspace files were not reverted.
- EN baseline remains stable (`~90.3`) after these JA-focused changes.
