# Handoff: Claude → Codex (Step 44 — Latency 개선 + Sidecar 수정)

Date: 2026-05-02
Branch: `main`
Last commit: `e9a3b44`

---

## 한 줄 요약

PyInstaller 번들 DLL 충돌 문제를 해결해 앱이 정상 시작되도록 수정하고,
오디오 버퍼 / beam size / LLM timeout을 줄여 자막 지연을 10s → 예상 3~4s로 단축.

---

## 오늘(2026-05-02) 완료한 작업

### 1. 지연 개선 (lib.rs 파라미터 튜닝)
| 항목 | 이전 | 변경 후 |
|---|---|---|
| 오디오 버퍼 최대치 | 4.4s (220청크) | 2s (100청크) |
| 묵음 감지 대기 | 360ms (18청크) | 200ms (10청크) |
| EN beam_size | 10 | 5 |
| JA beam_size | 14 | 8 |
| LLM 타임아웃 | 7s | 4s |

### 2. PyInstaller DLL 충돌 수정 (`apps/desktop/src-tauri/src/lib.rs`)
- **문제**: PyInstaller onefile 번들이 ctranslate2/torch/onnxruntime DLL 충돌로 크래시
- **해결**: `start_sidecars()`에서 local-ai 한정으로 Python venv를 직접 spawn
  - `resource_dir`에서 5단계 parent() 탐색으로 project root 계산
  - `\\?\` UNC 접두사 제거 후 Python 인수로 전달
  - venv 없을 때만 PyInstaller 번들 fallback

### 3. 단계별 타이밍 로그 추가 (`services/local-ai/main.py`)
- `/transcribe`: `lang_detect`, `stt` 각 단계별 ms 로그
- `/translate`: `llm`, `nllb`, `argos`, `marian` 각각 ms + fallback 경로 로그
- 형식: `[timing] transcribe total=1823ms stt=1790ms lang=en beam=5`

### 4. PyInstaller spec 개선 (`services/local-ai/local-ai.spec`)
- `runtime_hook_stub_torch.py` 추가 — torch/onnxruntime을 stub 모듈로 대체
  (ctranslate2 inference는 torch 불필요, conversion 코드만 사용)
- `excludes`에 `torch`, `torchvision`, `torchaudio` 추가

---

## 현재 앱 상태

**앱 실행 방법:**
```
apps\desktop\src-tauri\target\release\sorisori-desktop.exe
```

**시작 후 30~40초** 대기 → whisper medium + NLLB + MarianMT 로드 완료

**헬스 체크:**
```powershell
curl -s http://localhost:8789/health | python -m json.tool
```
`"whisper_ready": true`, `"translation_ready": true` 확인

**타이밍 로그 실시간 확인:**
```bash
tail -f /tmp/local-ai-timing.log | grep timing
```

---

## 현재 STT 품질 (변경 없음, step43 기준)
- EN: 90.30% (≥85 ✅)
- JA: 86.36% (≥75 ✅)
- JA music_mixed: 84.00% (목표 85 기준 -1%)

---

## 다음 권장 작업 (step45)

### 우선순위 A — 라이브 30분 검증 (강력 권장)
유튜브 영어/일본어 영상 30분 재생 후 자막 품질 + 지연 체감 확인.
타이밍 로그로 실제 병목 단계(STT vs 번역) 측정.

### 우선순위 B — beam 재조정 (품질↔속도 균형)
타이밍 결과에서 STT가 병목이면:
- EN: beam=5 유지 or beam=3으로 추가 감소
- JA: beam=8 유지 or beam=5 시도
번역이 병목이면:
- LLM timeout 4s → 3s
- `LOCAL_AI_LLM_BACKEND=none`으로 LLM 완전 비활성화 후 Argos/NLLB만 사용 테스트

### 우선순위 C — JA music_mixed 마지막 1% (84→85)
```bash
LOCAL_AI_STT_BEAM_SIZE_JA=12 python services/local-ai/eval/run_stt_eval.py \
  --url http://127.0.0.1:8789 --filter-lang ja --filter-source-type music_mixed
```

### 우선순위 D — PyInstaller 번들 완전 수정 (NSIS 배포용)
현재 venv spawn은 개발 환경에서만 동작. NSIS 인스톨러 배포를 위해:
- ctranslate2 + onnxruntime을 torch 없이 패키징하는 spec 완성
- `runtime_hook_stub_torch.py` + 추가 stub으로 segfault 해결

---

## 중요 제약 사항

- `cpal`로 회귀 금지 — WASAPI loopback 유지
- 유료 API (OpenAI, DeepL) 사용 금지
- Rust toolchain 1.86.0 고정
- 90% 토큰 도달 시 즉시 handoff 작성 후 중단

---

## 환경 재시작 명령 (venv 수동 실행 필요 시)

```powershell
$env:LOCAL_AI_PORT='8789'
$env:WHISPER_MODEL='medium'
$env:LOCAL_AI_STT_MODEL_JA='large-v3'
$env:LOCAL_AI_STT_BEAM_SIZE='5'
$env:LOCAL_AI_STT_BEAM_SIZE_JA='8'
$env:LOCAL_AI_STT_VAD_FILTER='false'
$env:LOCAL_AI_LLM_BACKEND='ollama'
$env:LOCAL_AI_LLM_MODEL='qwen2.5:7b-instruct-q4_K_M'
$env:LOCAL_AI_LLM_TIMEOUT_S='4'
services/local-ai/.venv/Scripts/python.exe services/local-ai/main.py
```
