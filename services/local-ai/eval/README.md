# Translation Eval Harness

Self-test infrastructure for sorisori-local-ai translation quality. Use this
to measure the impact of any translation engine change without manually
reviewing each subtitle.

## Files

- `corpus.json` — small reference corpus (EN/JA → KO) covering idioms,
  transport vocab, conversation, news, food, tech, lecture. Each case has
  multiple acceptable Korean references; the scorer takes the best chrF.
- `run_eval.py` — runs every case through the local-ai sidecar over HTTP,
  scores with chrF, prints per-case + aggregate, optionally saves JSON
  and compares against a baseline.

## Usage

1. Start the local-ai sidecar in one terminal:
   ```bash
   services/local-ai/.venv/Scripts/python.exe services/local-ai/main.py
   ```

2. In another terminal, run the eval:
   ```bash
   services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_eval.py
   ```

3. Save the current run as a baseline for future comparison:
   ```bash
   services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_eval.py \
     --save services/local-ai/eval/baseline.json
   ```

4. After making a translation change, compare against the baseline:
   ```bash
   services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_eval.py \
     --baseline services/local-ai/eval/baseline.json
   ```

## Filters

```bash
# Only English cases:
python services/local-ai/eval/run_eval.py --filter-lang en

# Only idioms:
python services/local-ai/eval/run_eval.py --filter-cat idiom

# Just aggregate, no per-case rows:
python services/local-ai/eval/run_eval.py --quiet
```

## Output

Each case prints:
```
ID                    CAT          L     ms   chrF  SRC                          OUT                          BEST_REF
en_idiom_001          idiom        en    487   12.5  Long time no see.            오랜 시간 보지 못했다       오랜만이야.
```

Aggregate prints per-language and per-category averages, plus latency
percentiles.

## Notes

- chrF (character F-score, n=6, beta=2) is used because it handles Korean
  without tokenization. Range: 0..100. As a rough rule of thumb:
  - 30+ : usable
  - 50+ : good
  - 70+ : near-human
- `references` allows multiple acceptable translations per case; the
  scorer takes the max chrF across them.
- Add real user-provided cases by appending objects to `corpus.json`. Keep
  references natural Korean, not literal translations.
- This harness only exercises `/translate` (text in → text out). End-to-end
  STT+translate evaluation can be added later by feeding audio clips to
  `/transcribe` first.

## STT Keyword Eval (85% target)

Use this for source transcription quality (before translation quality):

- `stt_corpus.json` — EN/JA audio cases with expected transcript and keywords.
- `run_stt_eval.py` — calls `/transcribe` and reports:
  - keyword retention (primary KPI)
  - text similarity
  - pass/fail with target `85%` weighted keyword retention

Setup:

1. Put WAV files under `services/local-ai/eval/audio/`.
2. Edit `services/local-ai/eval/stt_corpus.json`.
3. Run:
   ```bash
   services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_stt_eval.py
   ```

Useful options:

```bash
# Only English cases
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_stt_eval.py --filter-lang en

# Only Japanese cases
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_stt_eval.py --filter-lang ja

# Summary only
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_stt_eval.py --quiet
```

## EN/JA 200-set Builder

Target profile per language:

- `synthetic`: 30
- `human_external`: 40
- `music_mixed`: 30

Builder script:

```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py --allow-partial
```

Notes:

- Synthetic clips are generated with `edge-tts`.
- Human/music clips come from manifests in `services/local-ai/eval/sources/`.
- If exact target counts are required, remove `--allow-partial` and the build fails when data is missing.

Manifest templates:

- `services/local-ai/eval/sources/human_external_sources.template.json`
- `services/local-ai/eval/sources/music_sources.template.json`

Copy templates to:

- `services/local-ai/eval/sources/human_external_sources.json`
- `services/local-ai/eval/sources/music_sources.json`

and fill real sources/transcripts.

Auto-generate 140 scaffold slots first:

```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/generate_external_manifests.py --overwrite
```

This creates:
- `services/local-ai/eval/sources/human_external_sources.json` (EN 40 + JA 40)
- `services/local-ai/eval/sources/music_sources.json` (EN 30 + JA 30)

Then replace each `TODO_REPLACE_TRANSCRIPT_*` and `local_path` with real clips.

Auto-fill with public human speech + generated music mix (one-shot):

```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/populate_external_sources_auto.py
```

What this does:
- EN human 40: from `PolyAI/minds14` (`en-US`)
- JA human 40: from `shunyalabs/japanese-speech-dataset`
- EN/JA music 30 each: speech clips mixed with generated background music

Why generated music:
- avoids copyright risk from commercial songs/J-pop/Pop clips
- keeps a reproducible and legal stress-test set for STT robustness

## Gate Runner (EN>=85, JA>=75)

```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py
```

This command:

1. runs STT evaluation for all cases
2. saves a JSON report in `services/local-ai/eval/reports/`
3. prints gate decision:
   - PASS => continue tuning current components
   - FAIL => switch to component replacement phase

## App-side Evaluation Flow

For desktop-side real pipeline checks, run:

1. desktop app (`sorisori-desktop.exe`) or `npm run dev:desktop`
2. verify sidecar health:
   - realtime: `http://127.0.0.1:8787/health`
   - local-ai: `http://127.0.0.1:8789/health`
3. run STT gate script above against the same local-ai endpoint

This keeps evaluation bound to the same sidecar/runtime stack used by the app.
