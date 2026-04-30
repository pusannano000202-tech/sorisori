# Step 42 Checkpoint (2026-05-01)

## Goal
- Keep EN path fixed.
- Replace JA STT path only and measure quality delta with identical corpus.

## Code change (JA-only STT routing)
- File: `services/local-ai/main.py`
- Added env/config:
  - `LOCAL_AI_STT_MODEL_JA` (alias: `WHISPER_MODEL_JA`)
  - `LOCAL_AI_STT_BEAM_SIZE_JA`
- Added runtime behavior:
  - Default whisper model loaded as before (`WHISPER_MODEL`).
  - JA model lazily loaded on first JA request.
  - JA requests use JA model when configured; fallback to default if JA model load fails.
  - `/health` exposes:
    - `whisper_model`, `whisper_model_ja`
    - `whisper_ja_enabled`, `whisper_ja_ready`
    - `stt.model_default`, `stt.model_ja`, `stt.beam_size_ja`, `stt.ja_model_load_error`

## Experiment matrix

### Baseline (before model replacement)
- report: `services/local-ai/eval/reports/stt-gate-20260430-232727.json`
- EN: 90.30
- JA overall: 79.80
- JA human_external: 82.61
- JA music_mixed: 69.49

### Exp A — JA model = large-v3 (warm rerun, VAD=false, beam_ja=10)
- report: `services/local-ai/eval/reports/stt-ja-largev3-exp-20260430-rerun.json`
- JA overall: 85.35
- JA human_external: 86.09
- JA music_mixed: 79.66

### Exp B — JA model = large-v3, VAD=true, beam_ja=12
- reports:
  - `services/local-ai/eval/reports/stt-ja-largev3-vadtrue-beam12-human.json`
  - `services/local-ai/eval/reports/stt-ja-largev3-vadtrue-beam12-music.json`
- JA human_external: 84.35 (down)
- JA music_mixed: 76.27 (up vs old baseline, down vs Exp A)
- Conclusion: VAD=true hurts human path in this corpus.

### Exp C — JA model = large-v3, VAD=false, beam_ja=14
- report: `services/local-ai/eval/reports/stt-ja-largev3-vadfalse-beam14-full.json`
- JA overall: 85.35
- JA human_external: 86.09
- JA music_mixed: 79.66
- Conclusion: beam 14 gave no practical gain over beam 10.

### Full 200-set verification (EN lock check)
- report: `services/local-ai/eval/reports/stt-gate-20260501-005817.json`
- EN: 90.30 (no regression)
- JA: 85.35 (major lift)
- Gate: PASS

## What improved
- JA overall: `79.80 -> 85.35` (+5.55)
- JA human_external: `82.61 -> 86.09` (+3.48)
- JA music_mixed: `69.49 -> 79.66` (+10.17)

## Remaining gap vs strict user target
- Requested strict target: JA human_external >= 85 AND JA music_mixed >= 85
- Current:
  - JA human_external: 86.09 (met)
  - JA music_mixed: 79.66 (not met, -5.34)

## Recommended next step
1. Keep JA large-v3 route (clear win).
2. Attack JA music-only:
   - Add JA-only pre-denoise/highpass for music_mixed-like audio
   - Then rerun JA music subset first, full gate second.
