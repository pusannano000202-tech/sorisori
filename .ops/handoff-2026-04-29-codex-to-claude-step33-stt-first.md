# Codex → Claude Handoff (Step 33, STT-first)

## One-line summary
Main blocker is STT source corruption (EN/JA), not translation quality; pipeline was switched to STT-first tuning.

## User-critical symptom
- Input speech itself is captured incorrectly (phonetic garbage / broken kana-like output), so downstream translation cannot recover meaning.
- User explicitly requested:
  - prioritize EN/JA STT fixes
  - postpone Chinese
  - leave clear handoff docs for fresh LLM sessions

## What Codex changed

### A) local-ai transcription config
- `services/local-ai/main.py`
  - default `WHISPER_MODEL` -> `small`
  - added env-configurable STT knobs:
    - `LOCAL_AI_STT_BEAM_SIZE` (default 6)
    - `LOCAL_AI_STT_VAD_FILTER` (default false)
    - `LOCAL_AI_STT_CONDITION_ON_PREVIOUS_TEXT` (default false)
  - `/transcribe` now uses those knobs + `temperature=0.0`
  - `/health` now includes:
    - `stt.beam_size`
    - `stt.vad_filter`
    - `stt.condition_on_previous_text`

### B) realtime speech buffering
- `services/realtime/src/local-transcription-bridge.ts`
  - made speech buffer thresholds env-tunable:
    - `LOCAL_AI_BRIDGE_SILENCE_RMS_THRESHOLD` default 60
    - `LOCAL_AI_BRIDGE_SILENCE_CHUNKS_REQUIRED` default 20
    - `LOCAL_AI_BRIDGE_MIN_SPEECH_CHUNKS` default 32
    - `LOCAL_AI_BRIDGE_MAX_SPEECH_CHUNKS` default 180

### C) desktop sidecar launch profile
- `apps/desktop/src-tauri/src/lib.rs`
  - local-ai spawn env pins quality-first profile:
    - `WHISPER_MODEL=small`
    - `LOCAL_AI_STT_BEAM_SIZE=6`
    - `LOCAL_AI_STT_VAD_FILTER=false`
    - `LOCAL_AI_STT_CONDITION_ON_PREVIOUS_TEXT=false`
  - realtime spawn env pins buffering profile:
    - `LOCAL_AI_BRIDGE_SILENCE_RMS_THRESHOLD=60`
    - `LOCAL_AI_BRIDGE_SILENCE_CHUNKS_REQUIRED=20`
    - `LOCAL_AI_BRIDGE_MIN_SPEECH_CHUNKS=32`
    - `LOCAL_AI_BRIDGE_MAX_SPEECH_CHUNKS=180`

## Build artifacts regenerated
1. realtime sidecar rebuilt (`esbuild + pkg`)
2. local-ai sidecar rebuilt (`pyinstaller`)
3. NSIS rebuilt:
   - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`

## Verification snapshot
- `GET http://127.0.0.1:8789/health` now shows:
  - `"whisper_model": "small"`
  - `"stt": {"beam_size":6,"vad_filter":false,"condition_on_previous_text":false}`
  - `"llm.ready": true`

## Next tasks for Claude (ordered)
1. Install latest NSIS on user machine and run EN/JA fixed sentence test (10 + 10).
2. Log both:
   - raw transcript text
   - final translated text
3. Compute lightweight quality sheet:
   - key-word retention rate
   - obvious substitution count
4. If EN short utterances still weak:
   - set `LOCAL_AI_BRIDGE_MIN_SPEECH_CHUNKS=24`
   - set `LOCAL_AI_BRIDGE_SILENCE_CHUNKS_REQUIRED=16`
5. If JA still corrupted:
   - A/B `WHISPER_MODEL=medium` (same prompts, same corpus) and compare.

## Ready-to-use prompt for Claude
```text
task-log와 .ops/handoff-2026-04-29-codex-to-claude-step33-stt-first.md를 먼저 읽고,
지금 문제를 번역이 아닌 STT 정확도 문제로 가정해서 EN/JA 고정 문장 20개 A/B 평가를 진행해줘.
1) 현재 설정(small, beam6, bridge 60/20/32/180) baseline 측정
2) short-utterance 개선용으로 bridge 60/16/24/180 비교
3) 필요 시 whisper medium 비교
각 실험마다 raw transcript/translated text/오류 유형(치환·누락·환청) 표로 남기고,
최종적으로 user용 권장 기본값 1세트를 제안해줘.
```

