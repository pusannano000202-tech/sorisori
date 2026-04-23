- Date: 2026-04-23
- Topic: Step 25 complete - Argos-first local translation restore and long-form quality recheck

## Summary

- Re-ran the local-ai service with real `/translate` requests against long English lecture text and one Japanese sample.
- Confirmed the current MarianMT path (`Helsinki-NLP/opus-mt-tc-big-en-ko`) produces severely corrupted Korean output for long-form English.
- Restored Argos Translate as the default translation engine inside `services/local-ai/main.py`.
- Kept Marian loaded as a secondary fallback path, but the effective default is now Argos.
- Added Argos package installation back into `model-download.py` and restored `argostranslate` in `requirements.txt`.
- Updated `local-ai.spec` to include Argos hidden imports so packaged sidecars align with the runtime path.

## Files Changed

- `services/local-ai/main.py`
- `services/local-ai/model-download.py`
- `services/local-ai/requirements.txt`
- `services/local-ai/local-ai.spec`
- `services/local-ai/test_text_processing.py`
- `.gitignore`
- `.ops/task-log.md`
- `.ops/checkpoints/2026-04-23-1805-step25-argos-translation-restore.md`

## Validation

- `services/local-ai/.venv/Scripts/python.exe services/local-ai/test_text_processing.py`
- `services/local-ai/.venv/Scripts/python.exe -m py_compile services/local-ai/main.py services/local-ai/model-download.py services/local-ai/test_text_processing.py`
- Restarted `services/local-ai/main.py` and verified:
  - `GET http://127.0.0.1:8789/health`
  - `translation_engines.argos = true`
  - `translation_langs.argos = [en, ja, ko]`
- Re-ran long translation samples:
  - English long-form output improved from broken gibberish to rough-but-understandable Korean.
  - Japanese direct text now uses `ja -> en -> ko`, but still tends to compress meaning.

## Notes

- `services/local-ai/models/` was created locally during model experiments and is now ignored via `.gitignore`.
- Pre-existing dirty docs were left untouched:
  - `.ops/ai-bridge/shared-context.md`
  - `.ops/handoff-2026-04-23-claude-to-codex-step23-laptop-setup.md`

## Next Good Step

- Improve Korean post-processing on top of Argos output:
  - awkward phrase cleanup
  - common English leftovers (`readiness`, etc.) handling
  - better long-sentence splitting and merge strategy
- Then run a real desktop capture session against English lecture audio for user-facing subtitle review.
