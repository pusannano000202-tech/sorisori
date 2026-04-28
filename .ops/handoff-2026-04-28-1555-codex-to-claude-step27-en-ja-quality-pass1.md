# Handoff - Step 27 EN/JA Quality Pass 1

- Date: 2026-04-28 15:55 (KST)
- From: Codex
- To: Claude Code
- Branch: `main`

## Why this step

User reported severe EN/JA quality issues:
- English missing words / odd mistranslations
- Japanese path producing wrong Korean due EN bridge artifacts
- Mixed-language contamination in locked language sessions

## Applied fixes

### A) local-ai language path hardening
- File: `services/local-ai/main.py`
- Added `LOCAL_AI_LANGUAGE_HINT_MODE` (`strict|soft`, default `strict`)
- If `req.language` exists (desktop EN/JA select), transcribe is fixed to `task=transcribe`
- Auto-detected mode now only uses Whisper `task=translate` for non `en/ja/ko`
- Added script guards for locked modes:
  - `hint=en`: drop Hangul (strict also drops non-Latin output)
  - `hint=ja`: drop Hangul (strict also drops non-Japanese-like output)

### B) translation route corrections
- Removed broad Hangul passthrough (now only explicit `source_lang=ko` passes through)
- If session source is `ja` but transcript is English-like, prefer `en->ko` first
- Relaxed short-fragment dropping (non-CJK min words 3 -> 2)

### C) chunking timing
- File: `services/realtime/src/local-transcription-bridge.ts`
- Silence/flush thresholds relaxed to reduce sentence fragmentation:
  - 10 -> 14, 15 -> 20, 100 -> 150

## Verification

- `services/local-ai/.venv/Scripts/python.exe services/local-ai/test_text_processing.py` passed
- `npm run check -w @sorisori/realtime` passed
- `npm run test -w @sorisori/realtime` passed

## What Claude should do next

1. Run installer-runtime live test on EN + JA clips (same user scenario)
2. Log quality deltas specifically for:
   - idioms (`long time no see`, etc.)
   - transport lexicon (`shuttle`, `stop`)
3. Implement phrase post-edit dictionary (small deterministic rules) in local-ai translate path
4. Add drop counters to `/health` for:
   - language hint guard drops
   - short-fragment drops
   - hallucination drops

## Important

- Keep Chinese out of scope for now (user request)
- Do not revert existing dirty files unrelated to this step
- If token usage approaches 93%, switch to handoff mode immediately

