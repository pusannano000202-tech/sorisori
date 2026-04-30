# Step 37 — External Manifest 140-slot Auto Generation

Date: 2026-04-30

## Implemented

1. Added manifest scaffold generator
- New file: `services/local-ai/eval/generate_external_manifests.py`
- Output:
  - `services/local-ai/eval/sources/human_external_sources.json`
  - `services/local-ai/eval/sources/music_sources.json`
- Default counts:
  - human: EN 40 + JA 40
  - music: EN 30 + JA 30
  - total: 140

2. README update
- Updated: `services/local-ai/eval/README.md`
- Added command for one-shot 140-slot scaffold generation.

3. Raw folder structure for drop-in files
- Added:
  - `services/local-ai/eval/sources/raw/en/human/.gitkeep`
  - `services/local-ai/eval/sources/raw/en/music/.gitkeep`
  - `services/local-ai/eval/sources/raw/ja/human/.gitkeep`
  - `services/local-ai/eval/sources/raw/ja/music/.gitkeep`

## Run result

Command:
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/generate_external_manifests.py --overwrite
```

Result:
- `human_external_sources.json`: 80 entries
- `music_sources.json`: 60 entries
- total 140 entries generated

## Important

- Generated entries are scaffolds (`status: "todo"`).
- `expected_text`, `local_path`, and `license_note` still need real data.
- Strict dataset build will fail until real clips/transcripts are filled.

## Next step

1. Fill manifests with real clips + transcripts.
2. Place files under:
   - `services/local-ai/eval/sources/raw/en/human/`
   - `services/local-ai/eval/sources/raw/en/music/`
   - `services/local-ai/eval/sources/raw/ja/human/`
   - `services/local-ai/eval/sources/raw/ja/music/`
3. Run strict build:
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py
```
4. Run gate:
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py
```
