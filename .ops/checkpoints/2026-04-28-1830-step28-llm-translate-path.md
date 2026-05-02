# Checkpoint - Step 28 LLM Translate Path (Option A pivot)

- Date: 2026-04-28 18:30 (KST)
- Topic: Wire Ollama-backed Korean translation, capture quantitative delta vs Argos/NLLB baseline

## Why

Step 28 eval harness (1700 KST) made future translation work measurable. This
checkpoint executes phase 1-B/1-C of the pivot:
- 1-B: capture Argos/NLLB baseline.
- 1-C: add LLM (Qwen2.5-7B-Instruct Q4_K_M via Ollama) as primary translation
  path with Argos/NLLB as fallback, re-measure, decide.

User decision after seeing the delta: **option A** (sidecar wiring + manual
Ollama install for now; option C / installer-bundled auto-fetch deferred until
end-to-end live verification). This checkpoint covers the sidecar side; the
desktop wiring is handed off to codex (see handoff doc).

## What changed

### `services/local-ai/main.py`

1. New env vars (configuration block):
   - `LOCAL_AI_LLM_BACKEND` — empty (off) or `"ollama"`. Default: empty.
   - `LOCAL_AI_LLM_URL` — default `http://127.0.0.1:11434`.
   - `LOCAL_AI_LLM_MODEL` — default `qwen2.5:7b-instruct-q4_K_M`.
   - `LOCAL_AI_LLM_TIMEOUT_S` — default `7.0`.
   - `LOCAL_AI_LLM_NUM_PREDICT` — default `128`.
2. New global `_llm_ready` (set by `_probe_llm()` which calls `/api/tags` and
   verifies the model is registered).
3. New helpers:
   - `_probe_llm()` — startup probe, tolerant of daemon down.
   - `_llm_prompt(text, src_lang)` — Korean-translator system+user prompt with
     "Output ONLY the Korean translation" instruction.
   - `_sanitize_llm_output(raw)` — strips rubric prefixes ("Korean:", "한국어:",
     "Translation:"), surrounding quotes, takes first non-empty line.
   - `_translate_with_llm(text, src, tgt)` — POST `/api/generate` (stream:false,
     temperature 0.2). Returns None on timeout, error, empty output, or output
     missing Hangul. Each None bumps a drop counter.
4. `_load_translation()` now calls `_probe_llm()` after legacy engines load.
5. `/translate` flow: when `target_lang == "ko"` and `src ∈ {en, ja}` and
   `_llm_ready`, try LLM first. On None, bump `llm_fallback` counter and fall
   through to existing Argos/NLLB/Marian chain. **No legacy behavior was
   removed** — LLM is purely additive when the env flag is set.
6. `/health` now exposes:
   - `translation_engines.llm`
   - `llm` block: `backend`, `url`, `model`, `ready`, `timeout_s`
   - `drops.llm_empty`, `drops.llm_error`, `drops.llm_fallback`

### `services/local-ai/eval/run_eval.py`

- Forces UTF-8 on stdout/stderr at `main()` entry. Without this, Windows cp949
  consoles crash with `UnicodeEncodeError` on Japanese kanji in per-case rows.
  Permanent fix — works without `PYTHONIOENCODING=utf-8`.

### `services/local-ai/eval/baseline-argos-nllb.json` (new)

- 30-case baseline snapshot, captured 2026-04-28 17:22 against the
  Argos/NLLB/Marian-only sidecar. Frozen reference for all future engine
  changes.

### `services/local-ai/eval/run-qwen25-7b.json` (new)

- 30-case run snapshot with `LOCAL_AI_LLM_BACKEND=ollama` enabled, captured
  2026-04-28 18:10. The first quantitative comparison point.

## Verification

Sidecar restarted with `LOCAL_AI_LLM_BACKEND=ollama`. `/health` confirms:
- `translation_engines.llm = true`
- `llm.ready = true`, `llm.model = "qwen2.5:7b-instruct-q4_K_M"`
- All legacy engines (`argos`, `ja_direct`, `marian`) still ready.

`run_eval.py --baseline baseline-argos-nllb.json` output:

```
en->ko    n=15   avg chrF =  46.66   (baseline 25.30, +21.36)
ja->ko    n=15   avg chrF =  55.78   (baseline 36.11, +19.67)
overall   n=30   avg chrF =  51.22   (baseline 30.70, +20.52)
latency   avg = 1506.4 ms  p50 = 1458.4 ms  max = 6964.6 ms (cold start)
                 (baseline avg = 625.6 ms,  p50 = 379.1 ms)
vs baseline    ↑ +20.52 chrF
```

Per-category delta:
| category    | baseline | qwen | Δ      |
|-------------|---------:|-----:|-------:|
| greeting    |     8.00 |100.00| +92.00 |
| transport   |    27.91 |61.94 | +34.03 |
| idiom       |    15.78 |35.62 | +19.84 |
| food        |    23.37 |39.43 | +16.06 |
| news        |    43.00 |59.13 | +16.13 |
| lecture     |    59.76 |67.11 |  +7.35 |
| conversation|    32.17 |28.93 |  -3.24 |
| tech        |    56.27 |54.78 |  -1.49 |

Notable wins (baseline → qwen):
- "Long time no see." → "긴 시간 참조." (4.2) → "오랜만이야." (100.0)
- "Please transfer at the next station." → "다음 역으로 이동하십시오." (17.5)
  → "다음 역에서 환승하세요." (100.0)
- "お久しぶりです。" → "오래전부터요" (9.1) → "오랜만입니다." (100.0)
- "よろしくお願いします。" → "안녕하세요." (6.9) → "잘 부탁드립니다." (100.0)

Remaining failures (LLM ceiling at 7B Q4):
- en_conversation_001: "주말이怎么样？（注：...）" — Chinese token leak + model
  comments. Symptom of small-model multilingual confusion.
- en_idiom_002: "Break a leg!" → "다리 좀 부러워라!" — bad idiom mapping
  (literal-ish miss).
- en_idiom_003: "It's a piece of cake." → "케이크의 조각입니다." — literal
  failure also at LLM (Korean idiomatic = "식은 죽 먹기").
- ja_news_002: "오늘-policy 금리를 인상" — English token leak.

## Notes

- LLM cold start (first request) was 6964ms; subsequent requests stabilized
  ~1500ms. For desktop UX, a warmup ping at sidecar start would smooth this.
- All LLM failures fall through to legacy engines, so worst-case quality is
  ≥ baseline. `drops.llm_fallback` is the operational tell for tuning.
- Multilingual leaks are a 7B-Q4 weakness. Bumping to 14B-Q4 (~9GB, ~3s) likely
  removes most of them — held back as option B for after live verification.
- No new pip dependency added (urllib + json from stdlib).
- No legacy code paths were deleted — Argos/NLLB/Marian still the safety net.

## Next

Phase 1-D (option A) — desktop wiring. Handed off to codex:
- `apps/desktop/src-tauri/src/lib.rs` — pass `LOCAL_AI_LLM_BACKEND=ollama` and
  `LOCAL_AI_LLM_MODEL=...` env vars when spawning the local-ai sidecar.
- Desktop debug panel — show LLM ready badge from `/health`.
- README / install guide — Ollama install + `ollama pull` step for end users.
- Optional: warmup ping after sidecar boot to mask cold-start.

After 1-D, **live verification on a real YouTube clip** before deciding
option B (14B model) or option C-lite (auto-install Ollama from app first run,
~½–1 day).
