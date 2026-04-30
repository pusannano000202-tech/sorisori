# Step 38 — External 140 Auto Fill (Human + Music-Mixed)

Date: 2026-04-30

## Summary
- Requested action: "fill the 140 external slots with real data".
- Completed: auto-filled all 140 slots and generated real WAV files.

## Implemented

1. New script
- `services/local-ai/eval/populate_external_sources_auto.py`
- Function:
  - pulls EN human speech from `PolyAI/minds14` (`en-US`)
  - pulls JA human speech from `shunyalabs/japanese-speech-dataset`
  - normalizes all clips to mono/24k/PCM16/5s
  - writes:
    - `services/local-ai/eval/sources/human_external_sources.json` (80)
    - `services/local-ai/eval/sources/music_sources.json` (60)
  - creates music-mixed clips by overlaying generated background music
    - legal-safe alternative to copyrighted song clips
  - writes provenance:
    - `services/local-ai/eval/sources/external_sources_provenance.json`

2. README update
- Added usage for:
  - `populate_external_sources_auto.py`
- Explicitly documented why generated music bed is used (copyright-safe).

## Validation

1) Auto-fill run:
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/populate_external_sources_auto.py
```
Result:
- human=80
- music=60
- total=140

2) Strict dataset build (no partial):
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py
```
Result:
- EN: synthetic 30 / human 40 / music 30
- JA: synthetic 30 / human 40 / music 30
- strict target composition satisfied.

## Notes
- `sources/*.json` are ignored by `.gitignore` by design, so these local generated manifests are not tracked unless forced.
- raw WAV files are currently untracked local artifacts.
- For reproducibility on another machine, run `populate_external_sources_auto.py` again.
