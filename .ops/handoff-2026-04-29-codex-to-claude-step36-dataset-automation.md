# Handoff: Codex -> Claude (Step 36, dataset automation)

Date: 2026-04-29

## What changed

### New scripts
- `services/local-ai/eval/build_stt_dataset.py`
- `services/local-ai/eval/run_quality_gate.py`

### Updated scripts/docs
- `services/local-ai/eval/run_stt_eval.py`
- `services/local-ai/eval/README.md`
- `services/local-ai/requirements.txt` (added `edge-tts`)
- `.gitignore` (ignore generated eval artifacts)

### New templates
- `services/local-ai/eval/sources/human_external_sources.template.json`
- `services/local-ai/eval/sources/music_sources.template.json`
- `services/local-ai/eval/sources/raw/.gitkeep`

## Current status
- Builder can generate synthetic 30/30 automatically.
- External human/music paths are manifest-driven and pending real source fill.
- Gate runner works and saves JSON report.
- App-side runtime gate also validated (desktop exe sidecar mode).

## User-request alignment
- Implemented requested 200-set framework:
  - EN 100 / JA 100
  - split: 30 synthetic, 40 human external, 30 music mixed
- Implemented gate policy:
  - EN >= 85
  - JA >= 75
  - fail => switch phase

## Remaining
1. Populate external manifests with legal source clips + transcripts.
2. Build full corpus with strict counts (no `--allow-partial`).
3. Run gate on full corpus and branch:
   - PASS => continue tuning
   - FAIL => component replacement experiments

## Commands
```bash
# 1) Build corpus
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py --allow-partial

# 2) Run gate
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py
```
