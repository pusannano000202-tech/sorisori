# Checkpoint - Step 27 EN/JA Quality Pass 1

- Date: 2026-04-28 15:55 (KST)
- Topic: English/Japanese quality stabilization (Chinese deferred)

## What changed

1. `services/local-ai/main.py`
- Added language hint guard mode:
  - `LOCAL_AI_LANGUAGE_HINT_MODE=strict|soft` (default `strict`)
- For explicit language hint requests:
  - fixed `task=transcribe` (no forced Whisper translate hop)
- Auto mode:
  - `en/ja/ko` => transcribe
  - other languages => translate-to-English path
- Removed aggressive Hangul passthrough in translate route except explicit `source_lang=ko`
- For `source_lang=ja` with English-like text, try `en->ko` first
- Relaxed short-fragment threshold for non-CJK: min words 3 -> 2

2. `services/realtime/src/local-transcription-bridge.ts`
- Flush timing tuned to reduce sentence fragmentation:
  - silence chunks: 10 -> 14
  - min speech chunks: 15 -> 20
  - max speech chunks: 100 -> 150

3. Tests / env
- `services/local-ai/test_text_processing.py` updated and expanded
- `.env.example` added `LOCAL_AI_LANGUAGE_HINT_MODE=strict`

## Verification

- `services/local-ai/.venv/Scripts/python.exe services/local-ai/test_text_processing.py` => OK (8 tests)
- `npm run check -w @sorisori/realtime` => OK
- `npm run test -w @sorisori/realtime` => OK

## Next

1. Run installer-based live regression with English/Japanese sample clips
2. Add phrase-level post-edit dictionary for common idioms/transport expressions
3. Quantify drop reasons (language-guard / short-fragment / hallucination) via counters

