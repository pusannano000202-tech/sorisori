# Handoff: Codex -> Claude (Step 42 JA STT model replacement)

Date: 2026-05-01
Branch: `main`

## Done
- Implemented JA-only STT model routing in `services/local-ai/main.py`.
- Ran A/B experiments with `WHISPER_MODEL=medium` (EN fixed) and `LOCAL_AI_STT_MODEL_JA=large-v3`.
- Verified EN did not regress in full 200-case gate.

## Changed file
- `services/local-ai/main.py`

## New env vars
- `LOCAL_AI_STT_MODEL_JA` (or `WHISPER_MODEL_JA`)
- `LOCAL_AI_STT_BEAM_SIZE_JA`

## Key behavior
- Default model remains existing `WHISPER_MODEL`.
- JA model is lazy-loaded on first JA transcribe call.
- If JA model load fails, service logs warning and falls back to default model.
- `/health` now reports JA model readiness and load errors.

## Result summary
- Baseline report: `services/local-ai/eval/reports/stt-gate-20260430-232727.json`
  - EN 90.30 / JA 79.80
  - JA human 82.61 / JA music 69.49
- After JA large-v3 (best observed):
  - report: `services/local-ai/eval/reports/stt-gate-20260501-005817.json`
  - EN 90.30 / JA 85.35
  - JA human 86.09 / JA music 79.66

## Strict target status
- Target: JA human>=85 and JA music>=85
- Current:
  - JA human 86.09 (met)
  - JA music 79.66 (not met)

## Recommended continuation (Claude)
1. Keep JA large-v3 route enabled.
2. Add JA-only preprocessor for noisy music-like input (before whisper transcribe):
   - high-pass + light denoise + amplitude normalization.
3. Re-run:
   - music-only JA subset first:
     - `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_stt_eval.py --url http://127.0.0.1:8799 --filter-lang ja --filter-source-type music_mixed --save ...`
   - full 200-case gate second:
     - `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py --url http://127.0.0.1:8799`

## Reproduction command (best config)
```powershell
$env:LOCAL_AI_PORT='8799'
$env:WHISPER_MODEL='medium'
$env:LOCAL_AI_STT_MODEL_JA='large-v3'
$env:LOCAL_AI_STT_BEAM_SIZE='10'
$env:LOCAL_AI_STT_BEAM_SIZE_JA='14'
$env:LOCAL_AI_STT_VAD_FILTER='false'
$env:LOCAL_AI_LLM_BACKEND='ollama'
$env:LOCAL_AI_LLM_MODEL='qwen2.5:7b-instruct-q4_K_M'
services/local-ai/.venv/Scripts/python.exe services/local-ai/main.py
```
