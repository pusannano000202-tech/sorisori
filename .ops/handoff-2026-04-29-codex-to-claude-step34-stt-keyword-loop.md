# Handoff: Codex -> Claude (Step 34, STT-first 85% loop)

Date: 2026-04-29

## Context
User requested STT-first quality work with explicit KPI:
- `keyword retention >= 85%`
- Priority languages: EN + JA (ZH deferred)

## What was changed

1) `services/local-ai/main.py`
- Added new STT env knobs:
  - `LOCAL_AI_STT_NO_SPEECH_THRESHOLD`
  - `LOCAL_AI_STT_LOG_PROB_THRESHOLD`
  - `LOCAL_AI_STT_COMPRESSION_RATIO_THRESHOLD`
  - `LOCAL_AI_STT_MIN_CJK_CHARS`
  - `LOCAL_AI_STT_MIN_LATIN_WORDS`
  - `LOCAL_AI_STT_INITIAL_PROMPT_EN`
  - `LOCAL_AI_STT_INITIAL_PROMPT_JA`
- `/transcribe` now applies these thresholds and initial prompts.
- `/health.stt` exposes these fields.
- Short-fragment filter now configurable and less aggressive.

2) `services/realtime/src/local-transcription-bridge.ts`
- Default chunking tuned for less word drop:
  - RMS 45
  - silence 18 chunks
  - min speech 12 chunks
  - max speech 220 chunks

3) `apps/desktop/src-tauri/src/lib.rs`
- Wired all new STT env vars and updated bridge defaults to sidecar spawn.

4) STT eval harness
- Files:
  - `services/local-ai/eval/run_stt_eval.py`
  - `services/local-ai/eval/README.md`
  - `services/local-ai/eval/stt_corpus.template.json`
  - `services/local-ai/eval/stt_corpus.json`
  - `services/local-ai/eval/audio/.gitkeep`
- Harness supports object/array corpus formats and non-wav audio via PyAV.
- Error reporting improved (invalid run when all cases fail).

## Verified
- `py_compile`:
  - `services/local-ai/main.py`
  - `services/local-ai/eval/run_stt_eval.py`
- `npm run check:realtime` passed.
- `cargo check` for desktop passed.
- local-ai `/health` confirms new STT knobs are active when running source server.

## Smoke metric run
- Synthetic EN/JA audio set (temporary local files) used to verify loop wiring.
- `run_stt_eval.py` produced PASS (`100%` weighted keyword retention).
- This is only loop verification; not a real-world quality claim.

## Remaining critical work
1) Build real STT corpus from actual capture-domain clips (YouTube/dialogue):
   - at least 20 EN + 20 JA cases
   - each case: `audio_path`, `expected_text`, `keywords`
2) Run baseline and log real retention.
3) Iterate tuning with retention deltas:
   - bridge chunk params
   - STT thresholds
   - model size (consider `small -> medium` for JA if still weak)

## Safety note
- Worktree contains many unrelated/untracked files from prior sessions.
- Do **not** run destructive cleanup (`git clean -fdx`, restore all) blindly.
- Stage only relevant Step 34 files when committing.
