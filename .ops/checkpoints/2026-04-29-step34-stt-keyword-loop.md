# Step 34 — STT Keyword Retention Loop Started (2026-04-29)

## Goal
- Start an objective STT-first loop for EN/JA with KPI:
  - `weighted keyword retention >= 85%`

## Changes

### 1) STT decoding knobs + short-fragment guard tuning
- File: `services/local-ai/main.py`
- Added new env-configurable STT options:
  - `LOCAL_AI_STT_NO_SPEECH_THRESHOLD` (default `0.6`)
  - `LOCAL_AI_STT_LOG_PROB_THRESHOLD` (default `-1.0`)
  - `LOCAL_AI_STT_COMPRESSION_RATIO_THRESHOLD` (default `2.4`)
  - `LOCAL_AI_STT_MIN_CJK_CHARS` (default `3`)
  - `LOCAL_AI_STT_MIN_LATIN_WORDS` (default `1`)
  - `LOCAL_AI_STT_INITIAL_PROMPT_EN`
  - `LOCAL_AI_STT_INITIAL_PROMPT_JA`
- `/transcribe` now passes the thresholds + per-language initial prompt to Whisper.
- `/health.stt` now exposes all above values.
- `_is_short_fragment` now uses the new thresholds (less aggressive dropping of short but meaningful utterances).

### 2) Bridge chunking defaults (speech cut policy)
- File: `services/realtime/src/local-transcription-bridge.ts`
- New defaults:
  - silence RMS threshold: `45` (was `60`)
  - silence chunks required: `18` (was `20`)
  - min speech chunks: `12` (was `32`)
  - max speech chunks: `220` (was `180`)

### 3) Desktop sidecar env wiring
- File: `apps/desktop/src-tauri/src/lib.rs`
- Added local-ai STT env vars above to sidecar spawn.
- Updated realtime bridge env defaults to match Step 34 chunking values.

### 4) STT eval harness finalized
- Files:
  - `services/local-ai/eval/run_stt_eval.py`
  - `services/local-ai/eval/README.md`
  - `services/local-ai/eval/stt_corpus.template.json`
  - `services/local-ai/eval/stt_corpus.json`
  - `services/local-ai/eval/audio/.gitkeep`
- `run_stt_eval.py` now:
  - supports corpus as `[]` or `{ "cases": [] }`
  - resolves relative `audio_path` from corpus file directory
  - supports non-WAV audio (mp3/m4a/flac/ogg...) via PyAV fallback
  - prints clear error summary and marks run invalid when all cases error

## Validation run (local machine)
- local-ai source server health showed new STT fields in `/health`.
- Created temporary synthetic EN/JA sample audio for smoke validation (not part of committed assets).
- Command:
  - `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_stt_eval.py --corpus services/local-ai/eval/stt_corpus.json`
- Result:
  - `weighted keyword retention=100%` (synthetic smoke set)
  - PASS vs 85% target.

## Important note
- This proves eval loop works technically.
- Real quality must be measured on **real capture audio** (YouTube/dialogue clips from target use-cases), not synthetic TTS-only corpus.

## Next
1. Build real EN/JA STT corpus (20~40 cases total) with:
   - `audio_path`, `expected_text`, `keywords`
2. Run baseline with Step 34 defaults.
3. Tune in this order:
   - bridge chunk knobs
   - STT thresholds
   - Whisper model size (small -> medium for JA if needed)
4. Keep commit-by-commit deltas with retention change logs.
