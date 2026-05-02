# Handoff - Step 27 Drop Counters

- Date: 2026-04-28 16:35 (KST)
- From: Claude Code
- To: Codex (or next operator)
- Branch: `main` (uncommitted)

## Why this step

Codex's step27 pass 1 left four silent drop sites in the local-ai pipeline.
During live YouTube regression there was no way to attribute "missing
subtitle" events to a specific guard. This handoff covers the smallest
observability addition that lets the next regression session quantify drop
reasons without changing any pipeline behavior.

## Applied changes

### A) Drop counter instrumentation
- File: `services/local-ai/main.py`
- New `_drop_counters` dict (module-level, grouped):
  - `language_guard.{total,en_hangul,en_non_latin,ja_hangul,ja_non_japanese,translate_locked_hangul}`
  - `short_fragment`
  - `hallucination`
  - `whisper_translate_failed`
- Helpers: `_bump_language_guard`, `_bump_drop`
- Bumped at every existing drop site (transcribe + translate routes,
  `_apply_language_hint_guard`).

### B) `/health` exposure
- New `drops` field on the `/health` JSON payload — same shape as the
  internal counter dict.

### C) Tests
- File: `services/local-ai/test_text_processing.py`
- New `DropCounterTests` (4 tests) cover the most common increment paths
  and verify `/health` exposes the field.

## Verification

- `services/local-ai/.venv/Scripts/python.exe services/local-ai/test_text_processing.py`
  => OK (12 tests)
- `npm run check -w @sorisori/realtime` — NOT run this session (no realtime
  changes; left to next session if needed)
- `npm run test -w @sorisori/realtime` — NOT run this session (same reason)
- Installer NOT rebuilt — pure backend instrumentation, packaged sidecar
  picks it up on the next NSIS rebuild.

## What the next operator should do

1. **User-driven live test**: install latest NSIS build, play EN and JA
   YouTube clips, capture failing transcripts and the `/health` `drops`
   snapshot taken right after the run.
2. Use the drop distribution to scope the phrase post-edit dictionary
   (Codex step27 follow-up #2). High `language_guard.*` => guard is too
   strict; high `short_fragment` => need lexical dictionary or chunk
   timing tweak; high `hallucination` => similarity threshold tuning.
3. Implement the dictionary in `services/local-ai/main.py` translation
   path with deterministic rules.
4. Rebuild installer + repeat regression.

## Files touched this session

- `services/local-ai/main.py` (counter dict, helpers, 5 instrumentation
  points, `/health` exposure)
- `services/local-ai/test_text_processing.py` (4 new tests)
- `.gitignore` (Claude local settings ignore — unrelated to step27)
- `.claude/settings.local.json` (new — unrelated to step27)

## Important

- Did NOT touch `apps/desktop/src-tauri/src/lib.rs` (dirty since Codex
  session, out of scope).
- Did NOT commit. Operator decides whether to bundle these into a single
  step27 follow-up commit or split out the unrelated `.claude/`
  configuration.
- No env var added; no language-guard / flush-timing / translation logic
  changed. This step is purely observability.
