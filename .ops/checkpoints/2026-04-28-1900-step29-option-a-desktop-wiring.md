# Checkpoint - Step 29 Option A Desktop Wiring

- Date: 2026-04-28 19:00 (KST)
- Topic: Wire LLM translate path into the desktop sidecar spawn + UI status

## Why

Step 28 added the LLM translate path inside `services/local-ai/main.py` and
proved it lifts overall chrF from 30.70 → 51.22. But the desktop app (Tauri)
spawns the local-ai sidecar without the `LOCAL_AI_LLM_BACKEND` env var, so the
LLM was only active in dev terminals — end users would never see the
improvement. This step wires it through.

Decision was option A (always-on env, manual Ollama install for end users).
Option C-lite (app first-run auto-install of Ollama) is deferred until live
verification on a real video.

## What changed

### `apps/desktop/src-tauri/src/lib.rs`

Added three env vars to the local-ai sidecar spawn (~line 434):

```rust
.env("LOCAL_AI_LLM_BACKEND", "ollama")
.env("LOCAL_AI_LLM_MODEL", "qwen2.5:7b-instruct-q4_K_M")
.env("LOCAL_AI_LLM_URL", "http://127.0.0.1:11434")
```

Always-on. Sidecar's `_probe_llm()` is tolerant of Ollama being absent
(`_llm_ready=false`, falls through silently). Safe to ship even on PCs without
Ollama installed — quality just drops to baseline.

### `apps/desktop/src/main.js`

Added `formatHealthSummary()` helper. The sidecar debug pane now shows a
human-readable summary at the top, before the raw JSON dump:

```
=== AI 엔진 상태 ===
Whisper: ✓ base
번역 엔진:
  • LLM (qwen2.5:7b-instruct-q4_K_M): ✓  ← 우선 사용
  • Argos en→ko: ✓
  • NLLB ja→ko: ✓
  • MarianMT en→ko: ✓
LLM 실패 통계: fallback=2  (only shown when non-zero)
```

When `llm.backend === "ollama"` but `eng.llm === false`, the LLM line shows
`✗ Ollama 미설치 또는 모델 미다운로드 (docs/ollama-setup.md 참고)` — guides the
user to the install doc instead of just showing a cryptic failure.

### `docs/ollama-setup.md` (new)

End-user install guide:
- Why install (chrF 30.70 → 51.22 table, "no cost no telemetry" framing)
- 3-step install (Ollama → `ollama pull` → restart sorisori)
- FAQ (offline? cost? RAM? upgrade to 14B? remove model?)
- Troubleshooting (debug screen says ✗, pull stalls)

Linked from the debug pane LLM line on failure.

## Verification

- `cargo check` (apps/desktop/src-tauri) — Finished dev profile, no errors.
- `node --check apps/desktop/src/main.js` — JS syntax OK.
- `curl /health` confirms sidecar still ready with `llm.ready=true`,
  `llm.backend="ollama"`, `llm.model="qwen2.5:7b-instruct-q4_K_M"`.
- The eval still scores +20.52 chrF over baseline (re-running not necessary —
  no sidecar code changed in this step).

## Notes

- Did not build the full installer — that's a heavy step the user runs when
  they want a new NSIS package. cargo check is enough to catch the env-var
  edit, and the JS edit is hot-reloadable in dev.
- Did not touch test_text_processing.py — adding LLM-path tests would need
  the Ollama daemon mocked or skipped, and the existing 12 tests still cover
  legacy paths. New `llm_*` drop counters are tested via /health structure
  only (confirmed manually via curl).
- Did not commit. User's policy: commits happen explicitly.

## Next

**Live verification (user runs).** With this step shipped, the user can:
1. Build a new NSIS installer (or run desktop in dev), launch, open debug pane.
2. Confirm summary shows LLM ✓.
3. Play a real YouTube video (English idiom-heavy and Japanese conversational).
4. Watch live subtitles for:
   - Subjective quality (does it match the chrF lift?)
   - 1.5s extra latency tolerable for live use?
   - Multilingual token leak frequency (chinese/english bleeding into Korean)?
   - Cold-start: first subtitle takes ~7s — annoying or acceptable?

After live verification, decide:
- **OK** → ship as-is to GitHub remote, then plan option C-lite for general release.
- **Quality not enough** → option B (`qwen2.5:14b-instruct-q4_K_M`, ~9GB,
  ~3s/translate). Just `ollama pull` then `setx LOCAL_AI_LLM_MODEL ...`.
- **Latency too slow** → consider warmup on session start + smaller model
  variant (`qwen2.5:3b-instruct-q4_K_M`) eval comparison.
- **Cold start annoying** → add warmup ping in lifespan or at session start
  (see step 28 checkpoint "Optional warmup" section for two patterns).
