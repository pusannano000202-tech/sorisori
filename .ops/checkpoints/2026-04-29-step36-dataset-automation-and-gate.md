# Step 36 — Dataset Automation + Gate Runner

Date: 2026-04-29

## Implemented

1. STT corpus builder
- File: `services/local-ai/eval/build_stt_dataset.py`
- Features:
  - synthetic EN/JA clip generation via `edge-tts`
  - external ingestion from manifests (`human_external`, `music_mixed`)
  - normalization to mono/24kHz/PCM16
  - corpus output as `stt_corpus.json` (`version=2.0` schema)
  - strict/partial build mode (`--allow-partial`)

2. STT evaluator upgrade
- File: `services/local-ai/eval/run_stt_eval.py`
- Added:
  - `source_type` aware metrics
  - per-language gate thresholds (`--threshold-en`, `--threshold-ja`)
  - optional source filter (`--filter-source-type`)
  - JSON report save (`--save`)
  - Windows console Unicode-safe output

3. Gate runner
- File: `services/local-ai/eval/run_quality_gate.py`
- Uses evaluator and prints decision:
  - PASS => continue current component tuning
  - FAIL => switch to component replacement phase

4. Source templates
- Added:
  - `services/local-ai/eval/sources/human_external_sources.template.json`
  - `services/local-ai/eval/sources/music_sources.template.json`
  - `services/local-ai/eval/sources/raw/.gitkeep`

5. Documentation
- Updated: `services/local-ai/eval/README.md`
  - builder usage
  - source manifests
  - gate runner usage
  - app-side evaluation flow

6. Ignore generated artifacts
- Updated: `.gitignore`
  - ignore generated audio and reports under eval
  - keep `audio/.gitkeep`

## Validation run

1) Build (partial mode)
- command:
  - `python services/local-ai/eval/build_stt_dataset.py --allow-partial`
- result:
  - synthetic EN 30 + JA 30 built
  - external counts are 0 until manifests are filled

2) Gate (source local-ai runtime)
- command:
  - `python services/local-ai/eval/run_quality_gate.py`
- result:
  - EN retention ~98%
  - JA retention ~83.87%
  - PASS (synthetic-only set)

3) Gate (desktop app sidecar runtime)
- start `apps/desktop/src-tauri/target/release/sorisori-desktop.exe`
- run same gate command
- result:
  - EN retention ~98%
  - JA retention ~90.32%
  - PASS (synthetic-only set)

## Important
- Current pass is synthetic-only.
- Real target requires full 200-set composition:
  - EN: 30 synthetic + 40 human_external + 30 music_mixed
  - JA: 30 synthetic + 40 human_external + 30 music_mixed

## Next immediate step
1. Create real manifests:
   - `services/local-ai/eval/sources/human_external_sources.json`
   - `services/local-ai/eval/sources/music_sources.json`
2. Rebuild corpus without `--allow-partial`.
3. Re-run gate and verify EN>=85 / JA>=75 on full set.
