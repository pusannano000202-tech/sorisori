# Handoff — Claude → Codex — Step 29 (Option A: desktop wiring for LLM translate)

- Date: 2026-04-28 18:30 (KST)
- From: Claude (out at user's request — 5h-90% threshold rule)
- To: Codex
- Branch: `main` (no new branch yet; uncommitted changes listed below)
- Estimated remaining work: ~1 hour

## TL;DR

Backend LLM translate path is **done and verified** (chrF 30.70 → 51.22,
+20.52, 67% improvement). User chose **option A**: wire the desktop sidecar
spawn to enable the LLM by default and document the manual Ollama install for
end users. Live verification on a real video comes after this. Option B (14B
model) and option C-lite (auto-install Ollama on first run) are deferred.

This handoff is the desktop-side wiring **only**. The sidecar (`main.py`) is
already done.

## What's already done (do not redo)

1. `services/local-ai/main.py` — full LLM path added (env-flagged, fallback
   preserved). See checkpoint
   `.ops/checkpoints/2026-04-28-1830-step28-llm-translate-path.md` for the
   full spec of new env vars, helpers, drop counters, and `/health` schema
   changes.
2. `services/local-ai/eval/run_eval.py` — UTF-8 stdout fix.
3. `services/local-ai/eval/baseline-argos-nllb.json` — baseline snapshot.
4. `services/local-ai/eval/run-qwen25-7b.json` — qwen2.5 run snapshot.
5. `services/local-ai/eval/README.md` — usage guide.
6. `.ops/ai-bridge/shared-context.md` — translation stack section + 90%
   handoff threshold updated.
7. Ollama installed at `C:\Users\user6\AppData\Local\Programs\Ollama\ollama.exe`
   (v0.21.2) on user's dev machine. Model `qwen2.5:7b-instruct-q4_K_M`
   (4.68 GB) pulled and verified via `/api/tags`.

## Current process state on user's machine

- Sidecar (`services/local-ai/main.py`) is **currently running with the LLM
  enabled** in a background bash task. Started with:
  ```bash
  LOCAL_AI_LLM_BACKEND=ollama LOCAL_AI_LLM_MODEL=qwen2.5:7b-instruct-q4_K_M \
    services/local-ai/.venv/Scripts/python.exe services/local-ai/main.py
  ```
  Health confirms `llm.ready=true`. If you need to restart, kill PID on port
  8789 (`netstat -ano | grep ':8789 '`) and respawn with the same env vars.
- Ollama daemon listens on `127.0.0.1:11434` (auto-started by Windows after
  install). Verify with `curl -s http://127.0.0.1:11434/api/tags`.

## Tasks for you (option A — three pieces)

### Task 1 — Inject LLM env vars when Tauri spawns the local-ai sidecar

**File:** `apps/desktop/src-tauri/src/lib.rs` ~line 434–440

Current code (verified by grep):
```rust
// local-ai (Python/faster-whisper)
match sidecar_command(&local_ai_exe)
    .env("LOCAL_AI_HOST", "127.0.0.1")
    .env("LOCAL_AI_PORT", "8789")
    ...
    .spawn()
```

Add the LLM env vars after `LOCAL_AI_PORT`:
```rust
.env("LOCAL_AI_HOST", "127.0.0.1")
.env("LOCAL_AI_PORT", "8789")
.env("LOCAL_AI_LLM_BACKEND", "ollama")
.env("LOCAL_AI_LLM_MODEL", "qwen2.5:7b-instruct-q4_K_M")
.env("LOCAL_AI_LLM_URL", "http://127.0.0.1:11434")
```

Notes:
- These are **always-on** for option A. The sidecar's `_probe_llm()` is
  tolerant of Ollama being absent (sets `_llm_ready=false`, falls through to
  Argos/NLLB silently). So shipping with the env set even on PCs where the
  user hasn't installed Ollama is safe — quality just drops back to baseline.
- Do **not** introduce a config flag in the desktop UI for this in option A.
  We agreed UI surfacing of LLM toggle is for option C, not now.
- Keep the timeout at the default 7s (no need to set `LOCAL_AI_LLM_TIMEOUT_S`).

### Task 2 — Show LLM status badge on the desktop debug panel

**Where:** the debug screen that already polls `/health` for whisper/translation
engine status. Look for the existing "translation_engines" rendering — likely
in a React component under `apps/desktop/src/...` or whichever frontend
location the debug panel uses. Grep for `translation_engines` or `whisper_ready`
to find it.

What to add: a small badge/row showing either
- `LLM: qwen2.5:7b ✓` (green) when `health.llm.ready === true`
- `LLM: off` (grey) when `health.llm.backend === ""`
- `LLM: backend reachable, model missing` (yellow) when `backend === "ollama"`
  but `ready === false`

The `/health` payload now contains:
```json
"llm": {
  "backend": "ollama",
  "url": "http://127.0.0.1:11434",
  "model": "qwen2.5:7b-instruct-q4_K_M",
  "ready": true,
  "timeout_s": 7.0
},
"drops": {
  ...
  "llm_empty": 0,
  "llm_error": 0,
  "llm_fallback": 0
}
```

If there's a "drops" panel already (added in step 27), add the three new
LLM drop counters to it.

### Task 3 — User-facing install guide

Add (or update) a section to whichever README the end-user follows for first
install. If unsure, create
`docs/ollama-setup.md` and link it from the desktop debug panel's LLM badge
("LLM: off — setup guide →").

Content (concise — user is not a developer):

> **AI 번역 엔진 설치 (1회)**
>
> 더 자연스러운 자막 번역을 위해 Ollama를 함께 설치합니다.
>
> 1. https://ollama.com/download/windows 에서 OllamaSetup.exe 다운로드 → 실행.
> 2. 설치가 끝나면 시스템 트레이에 라마 아이콘이 떴는지 확인.
> 3. PowerShell을 새로 열고 다음 한 줄을 실행 (모델 4.7GB, 약 5분):
>    ```
>    ollama pull qwen2.5:7b-instruct-q4_K_M
>    ```
> 4. 완료되면 sorisori 앱을 재시작. 디버그 화면에 `LLM: qwen2.5:7b ✓` 가 뜨면 끝.
>
> 설치하지 않아도 앱은 동작하지만, idiom·인사말·구어체 자막 품질이
> 약 67% 떨어집니다 (chrF 51.22 → 30.70).

## Optional warmup (recommended if you have time)

First LLM request takes ~7s (model load into VRAM); subsequent ~1.5s. This
shows up as a noticeably slow first subtitle when a session starts. Two
ways to mask:

**Option a (sidecar-side, simplest):** in `_load_translation()` after
`_probe_llm()`, fire one throwaway `_translate_with_llm("hello", "en", "ko")`
to pre-warm. Caveat: blocks sidecar boot ~7s, so user sees `whisper_ready`
later.

**Option b (desktop-side, no boot impact):** when user clicks "Start session",
send one warmup `/translate` request before opening the WebSocket gateway. Ad
hoc, no server change.

Pick whichever fits the existing flow better.

## Files NOT to touch (Claude is leaving uncommitted)

These are user/Claude in-progress and will be committed separately:
- `.gitignore`
- `apps/desktop/src-tauri/src/lib.rs` (only the lines you're adding for task 1
  — do not "clean up" unrelated changes)
- `.claude/`
- `services/local-ai/main.py` (already complete; do not refactor)
- `services/local-ai/test_text_processing.py` (step 27 drop counter tests; if
  you add llm_* tests, add a new class, do not edit existing)
- The two `.docx` files at repo root — user's reference materials.
- `.bkit/`, `.ops/image/`, `docs/image/` — user assets.

## Verification before committing your work

1. `services/local-ai/.venv/Scripts/python.exe -m py_compile services/local-ai/main.py`
   should still print nothing (no errors). You should not be touching this
   file but verify it's intact.
2. After your `lib.rs` edit, build the Tauri app and confirm the spawned
   sidecar's `/health` shows `llm.backend == "ollama"` (whether or not Ollama
   is actually running on the dev machine).
3. With Ollama running and the model pulled, confirm `llm.ready == true`.
4. Run a quick sanity translation through the desktop debug panel, then
   re-run the eval to confirm score still ≥ 50:
   ```bash
   PYTHONIOENCODING=utf-8 services/local-ai/.venv/Scripts/python.exe \
     services/local-ai/eval/run_eval.py \
     --baseline services/local-ai/eval/baseline-argos-nllb.json --quiet
   ```

## Risks / things to know

- **Don't strip the legacy translation paths.** Argos/NLLB/Marian are the
  fallback safety net. If Ollama is down on a user's machine, the sidecar
  must still translate — just at baseline quality.
- **Multilingual leaks at 7B-Q4** are a known model-side issue, not a code
  bug. ~5% of outputs may contain stray Chinese or English tokens. Live
  verification will tell us if it's tolerable; if not, we go to option B
  (14B model) which removes most of them. Don't try to filter in code — too
  brittle.
- **The 7s cold start can look like a hang** on the first subtitle of a new
  session. The warmup task above mitigates this.
- **When user runs the eval they will see the per-case rows.** That output is
  large but informative — don't add `--quiet` to user-facing instructions
  unless they ask.

## Context restoration for codex

Read in this order if you need full context (most → least relevant):
1. `.ops/checkpoints/2026-04-28-1830-step28-llm-translate-path.md` ← most recent
2. `.ops/checkpoints/2026-04-28-1700-step28-eval-harness.md`
3. `.ops/ai-bridge/shared-context.md` (top + "다음 우선순위" section)
4. `services/local-ai/eval/README.md`
5. `services/local-ai/main.py` lines 1-160 (config + globals) and the
   `/translate` route (~830-880 after edits)

User decision points already settled — do not reopen:
- Argos/NLLB stays as fallback (do not remove).
- Option A is "always-on env, no UI toggle" for now.
- Option B/C deferred until live YouTube verification.
- Sidecar code complete; you only do desktop wiring + docs.

When done: write a short reply checkpoint
`.ops/checkpoints/2026-04-28-XXXX-step29-desktop-llm-wiring.md` and update
`shared-context.md` "다음 우선순위" to reflect that 1-D is done and live
verification is next.
