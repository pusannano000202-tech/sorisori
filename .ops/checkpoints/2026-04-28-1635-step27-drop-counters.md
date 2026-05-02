# Checkpoint - Step 27 Drop Counters

- Date: 2026-04-28 16:35 (KST)
- Topic: Drop reason observability for EN/JA quality pass

## Why

Step 27 pass 1 added several silent guards (language hint, short-fragment,
hallucination, whisper-translate-failed). Without counters we cannot tell
which guard is firing during live YouTube tests, so we cannot quantify the
quality impact of future tuning.

## What changed

1. `services/local-ai/main.py`
   - New module-level `_drop_counters` dict with grouped buckets:
     - `language_guard` (sub: `total`, `en_hangul`, `en_non_latin`,
       `ja_hangul`, `ja_non_japanese`, `translate_locked_hangul`)
     - `short_fragment`
     - `hallucination`
     - `whisper_translate_failed`
   - Helpers: `_bump_language_guard(reason)`, `_bump_drop(category)`
   - Instrumented every existing drop site:
     - `_apply_language_hint_guard`: 4 sub-reasons
     - `transcribe`: short_fragment, hallucination, whisper_translate_failed
     - `translate`: translate_locked_hangul
   - `/health` now exposes `drops` field with the full nested counter dict.

2. `services/local-ai/test_text_processing.py`
   - New `DropCounterTests` class (4 tests):
     - en_hangul guard increments
     - ja_non_japanese strict guard increments
     - translate locked-hangul counter increments
     - `/health` payload exposes `drops`

## Verification

- `services/local-ai/.venv/Scripts/python.exe services/local-ai/test_text_processing.py`
  => OK (12 tests, 8 existing + 4 new)

## Notes

- Counters reset only on process restart (sidecar boot). That is sufficient
  for per-session live testing — operator restarts the desktop app between
  runs.
- No new env var introduced.
- No change to flush timing, language guard logic, or translation paths —
  this checkpoint is purely additive observability.

## Next

1. User runs live EN/JA YouTube regression with the new installer and
   captures both the failing transcripts and the `/health` `drops` snapshot.
2. Use the captured drop distribution to decide where the phrase post-edit
   dictionary should focus (idioms, transport vocab, etc.).
3. Optionally rebuild installer once dictionary is added; counters alone do
   not require a rebuild for backend testing but desktop sidecar is the
   packaged path.
