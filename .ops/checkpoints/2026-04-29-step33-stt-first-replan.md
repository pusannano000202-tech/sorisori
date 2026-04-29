# Step 33 Checkpoint — STT First Replan (2026-04-29)

## Why plan changed
User feedback confirms the main failure is **not translation** but **source transcription quality**.

Observed examples:
- English speech such as `hi how are you?` becomes phonetically broken text (`hey wow r you?` style).
- Japanese speech is often captured as malformed kana/romaji-like fragments, then translated from already-broken source.

Conclusion:
- LLM quality is secondary unless STT source quality is stabilized first.

## What was changed now (implemented)

### 1) Local STT defaults moved to quality-first
- File: `services/local-ai/main.py`
- `WHISPER_MODEL` default changed:
  - from `base` -> `small`
- Added tunable STT env params:
  - `LOCAL_AI_STT_BEAM_SIZE` (default `6`)
  - `LOCAL_AI_STT_VAD_FILTER` (default `false`)
  - `LOCAL_AI_STT_CONDITION_ON_PREVIOUS_TEXT` (default `false`)
- Applied in `/transcribe` call:
  - `beam_size=STT_BEAM_SIZE`
  - `vad_filter=STT_VAD_FILTER`
  - `condition_on_previous_text=STT_CONDITION_ON_PREVIOUS_TEXT`
  - `temperature=0.0`
- `/health` now exposes current STT decode settings under `stt`.

### 2) Realtime speech-chunking tuned for more context
- File: `services/realtime/src/local-transcription-bridge.ts`
- Buffering thresholds now env-tunable and less aggressive:
  - `LOCAL_AI_BRIDGE_SILENCE_RMS_THRESHOLD` default `60`
  - `LOCAL_AI_BRIDGE_SILENCE_CHUNKS_REQUIRED` default `20` (~400ms)
  - `LOCAL_AI_BRIDGE_MIN_SPEECH_CHUNKS` default `32` (~640ms)
  - `LOCAL_AI_BRIDGE_MAX_SPEECH_CHUNKS` default `180` (~3.6s)

### 3) Desktop runtime pins STT/bridge quality profile
- File: `apps/desktop/src-tauri/src/lib.rs`
- local-ai sidecar launch env now includes:
  - `WHISPER_MODEL=small`
  - `LOCAL_AI_STT_BEAM_SIZE=6`
  - `LOCAL_AI_STT_VAD_FILTER=false`
  - `LOCAL_AI_STT_CONDITION_ON_PREVIOUS_TEXT=false`
- realtime sidecar launch env now includes:
  - `LOCAL_AI_BRIDGE_SILENCE_RMS_THRESHOLD=60`
  - `LOCAL_AI_BRIDGE_SILENCE_CHUNKS_REQUIRED=20`
  - `LOCAL_AI_BRIDGE_MIN_SPEECH_CHUNKS=32`
  - `LOCAL_AI_BRIDGE_MAX_SPEECH_CHUNKS=180`

## Build status
- local-ai sidecar rebuilt (`PyInstaller`)
- realtime sidecar rebuilt (`esbuild + pkg`)
- desktop NSIS rebuilt
  - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`

## Runtime verification (after this step)
- `/health` confirms:
  - `whisper_model = small`
  - `stt.beam_size = 6`
  - `stt.vad_filter = false`
  - `stt.condition_on_previous_text = false`
  - `llm.ready = true`

## Revised execution strategy (STT-first)
1. Lock language (`en` or `ja`) and test STT raw quality first.
2. Measure drop counters:
   - `short_fragment`
   - `language_guard.*`
   - `hallucination`
3. If STT still misses short utterances:
   - lower `LOCAL_AI_BRIDGE_MIN_SPEECH_CHUNKS` to `24`
   - lower `LOCAL_AI_BRIDGE_SILENCE_CHUNKS_REQUIRED` to `16`
4. If STT still phonetically drifts:
   - test `WHISPER_MODEL=medium` on target machine
   - compare 20 fixed sentences (EN 10 + JA 10) WER/CER-like manual score
5. Only after STT source is stable, tune translation prompts/LLM.

## Acceptance criteria (next gate)
- EN short sentence set: at least 80% key-word preserved in source transcript.
- JA short sentence set: at least 75% content-word preservation in source transcript.
- `short_fragment` drop rate stays low (no systemic over-drop in normal speaking pace).

