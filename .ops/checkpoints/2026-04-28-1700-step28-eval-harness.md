# Checkpoint - Step 28 Translation Eval Harness

- Date: 2026-04-28 17:00 (KST)
- Topic: Self-test infrastructure to break the manual review loop

## Why

Step 27 was an iterative cycle: change code → user reviews each subtitle →
report pain points → tweak → repeat. That loop will not converge because
(1) the underlying community models (Argos / NLLB / Marian) have a hard
quality ceiling and (2) we have no objective metric. User correctly
flagged that threshold tweaking (flush 10→14 etc) is treating symptoms,
not causes.

This checkpoint installs the prerequisite for any further quality work:
an automated, repeatable benchmark we can compare future engine changes
against.

## What changed

1. `services/local-ai/eval/corpus.json` (new)
   - 30 reference cases (15 EN→KO, 15 JA→KO)
   - Categories: idiom, transport, conversation, news, food, tech,
     greeting, lecture
   - Each case has 2-3 acceptable Korean references; scorer takes max chrF
   - Focused on known weak spots (idioms like "long time no see", transport
     vocabulary like "shuttle/transfer/platform", etc.)

2. `services/local-ai/eval/run_eval.py` (new)
   - Self-contained chrF (character n-gram F-score, n=6, beta=2)
     implementation — no third-party metric dependency; uses urllib only
   - Calls `/translate` over HTTP against the running sidecar
   - Per-case + per-language + per-category aggregate output
   - Latency measurement (avg, p50, max)
   - `--save baseline.json` to snapshot a run
   - `--baseline baseline.json` to compare against a saved snapshot
     (prints chrF delta with arrow)
   - Filters: `--filter-lang en|ja`, `--filter-cat idiom|...`, `--quiet`

3. `services/local-ai/eval/README.md` (new)
   - Usage instructions and rough chrF interpretation guide

## Verification

- chrF sanity (no sidecar required):
  - identical pair: 100.0
  - near-miss (1 char diff in 7-char Korean): 37.8
  - unrelated: 0.0
  - literal MT of an idiom ("Long time no see" -> "오랜 시간 보지 못했다")
    against good references: 7.3 — confirms the scorer punishes literal
    idiom mistranslations, which is exactly the failure mode we are
    trying to fix.
- Corpus parses: 30 cases (15 en, 15 ja).
- No new pip dependency added.

## Notes

- Eval requires the sidecar running on `http://127.0.0.1:8789`. The
  script prints clear instructions when unreachable.
- chrF was chosen over BLEU because Korean tokenization is fragile and
  chrF operates on raw characters.
- This is a pure addition. No existing pipeline behavior changed in this
  step.

## Next

1. Capture current Argos/NLLB baseline:
   ```
   .../python.exe services/local-ai/eval/run_eval.py \
     --save services/local-ai/eval/baseline-argos-nllb.json
   ```
   This becomes the fixed reference point for any future engine change.
2. Install Ollama on user's machine, pull a candidate Korean-strong LLM
   (Qwen2.5-7B-Instruct Q4 first; if too slow on integrated GPU, drop to
   3B). Add LLM-backed translate path behind a feature flag.
3. Re-run eval with `--baseline baseline-argos-nllb.json` to quantify
   quality + latency delta. Decision is then data-driven, not vibes.
4. Iterate translation engine independently of subtitle/UI work — every
   change scored automatically; user only reviews score deltas.
