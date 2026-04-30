# Handoff: Codex -> Claude (Step 37, 140 manifest autogen)

Date: 2026-04-30

## What changed

### New script
- `services/local-ai/eval/generate_external_manifests.py`
  - Generates external source scaffolds in one command.
  - Defaults:
    - human EN40 + JA40
    - music EN30 + JA30

### Updated docs
- `services/local-ai/eval/README.md`
  - Added scaffold generation command and usage note.

### Added raw folder structure
- `services/local-ai/eval/sources/raw/en/human/.gitkeep`
- `services/local-ai/eval/sources/raw/en/music/.gitkeep`
- `services/local-ai/eval/sources/raw/ja/human/.gitkeep`
- `services/local-ai/eval/sources/raw/ja/music/.gitkeep`

## Generated artifacts (local)

Executed:
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/generate_external_manifests.py --overwrite
```

Created:
- `services/local-ai/eval/sources/human_external_sources.json` (80)
- `services/local-ai/eval/sources/music_sources.json` (60)

## Current status

- 140-slot manifests are now ready to be filled.
- Each entry currently has placeholder values:
  - `expected_text`: `TODO_REPLACE_TRANSCRIPT_*`
  - `local_path`: `raw/<lang>/<type>/<id>.wav`
  - `license_note`: `TODO: source-and-license`
  - `status`: `todo`

## Remaining

1. Fill each slot with real clip metadata/transcript.
2. Drop actual files into raw folders.
3. Run strict build (without `--allow-partial`).
4. Run gate and review EN/JA retention.

## Commands for next operator

```bash
# Re-generate scaffolds if needed
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/generate_external_manifests.py --overwrite

# Build strict (must pass all counts and file existence)
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py

# Quality gate
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py
```
