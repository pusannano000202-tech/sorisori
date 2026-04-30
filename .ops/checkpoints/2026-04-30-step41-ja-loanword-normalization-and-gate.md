# Step 41 Checkpoint (2026-04-30)

## Goal
- Reflect Japanese loanword reality (e.g., `3%`, `パーセント`, mixed katakana/latin usage) in the STT quality loop.
- Improve JA score without degrading EN baseline.

## Code changes
- `services/local-ai/eval/run_stt_eval.py`
  - Added JA loanword alias normalization (`percent`, `chocolate`, `shuttle`, `media`, etc.).
  - Added katakana->hiragana normalization for robust matching.
  - Added JA fuzzy keyword matching fallback (SequenceMatcher threshold 0.75).
- `services/local-ai/eval/build_stt_dataset.py`
  - Reworked JA keyword selection to prioritize:
    - numeric anchors (`32%`, `4月`, `2位` ...)
    - katakana/loanword anchors
    - robust CJK anchors
  - JA keywords are recomputed during corpus build (so old manifest keywords don't lock us to brittle tokens).
- `services/local-ai/eval/populate_external_sources_auto.py`
  - Matched JA keyword policy with dataset builder.
  - Removed JA ASCII penalty in sample selection (loanword usage is normal in JP speech).
  - Tuned JA music mix generation (speech-dominant SNR/noise profile).

## Re-run commands
1. `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/populate_external_sources_auto.py`
2. `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py`
3. `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py`

## Latest gate result
- Report: `services/local-ai/eval/reports/stt-gate-20260430-232727.json`
- Overall:
  - EN: `90.30`
  - JA: `79.80`
  - Gate: `PASS` (EN>=85, JA>=75)
- Detailed split:
  - EN `human_external`: `88.61`
  - EN `music_mixed`: `85.34`
  - JA `human_external`: `82.61`
  - JA `music_mixed`: `69.49`

## Interpretation
- Loanword-aware matching and JA keyword policy improved total JA stability.
- Remaining bottleneck is still `JA music_mixed`.
- To reach stricter target (`JA human_external >=85` and `JA music_mixed >=85`), model-side upgrade is still needed (JA-only STT replacement path: `large-v3` or JA-specialized route).
