# Handoff: Codex -> Claude (Step 38, autofill 140 external)

Date: 2026-04-30

## What was done

### New script
- `services/local-ai/eval/populate_external_sources_auto.py`
  - EN human source: `PolyAI/minds14` (`en-US`)
  - JA human source: `shunyalabs/japanese-speech-dataset`
  - For each clip:
    - decode/cast audio
    - normalize mono 24k PCM16
    - fit to 5 seconds
  - Music-mixed set:
    - speech + generated procedural background music
    - avoids copyright risk from commercial songs

### Generated local files
- `services/local-ai/eval/sources/human_external_sources.json` (80)
- `services/local-ai/eval/sources/music_sources.json` (60)
- `services/local-ai/eval/sources/external_sources_provenance.json`
- WAV files under:
  - `services/local-ai/eval/sources/raw/en/human/*.wav` (40)
  - `services/local-ai/eval/sources/raw/en/music/*.wav` (30)
  - `services/local-ai/eval/sources/raw/ja/human/*.wav` (40)
  - `services/local-ai/eval/sources/raw/ja/music/*.wav` (30)

### Validation completed
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/populate_external_sources_auto.py
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py
```

Strict build passed with full target composition:
- EN: 30 synthetic + 40 human + 30 music
- JA: 30 synthetic + 40 human + 30 music

## Caveats
- `.gitignore` currently ignores `services/local-ai/eval/sources/*.json`, so generated manifests are local unless forced.
- raw WAV files are untracked local artifacts; regenerate with script on each machine.

## Suggested next steps
1. Run STT gate on full 200 set:
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py
```
2. If EN<85 or JA<75:
   - move to component replacement path in TRD (Whisper tier upgrade / JA-specific STT route).
