# Handoff: Claude → Codex (Step 43 JA audio preprocessing)

Date: 2026-05-01
Branch: `main`

## 한 줄 요약
JA 전용 오디오 전처리(high-pass + pre-emphasis + RMS normalize) 추가로
JA music_mixed 79.66 → 84.00, JA 전체 85.35 → 86.36 달성.

## 변경 파일
- `services/local-ai/main.py`
  - `_preprocess_ja_audio(samples)` 추가 (numpy only, scipy 불필요)
  - `/transcribe`: `using_ja_model=True` 시 전처리 적용

## 최신 게이트 결과
- Report: `services/local-ai/eval/reports/stt-gate-20260501-013217.json`
- EN 90.30 (>=85) ✅ / JA 86.36 (>=75) ✅
- JA human_external: 87.91 / JA music_mixed: 84.00

## 마감
**2026-05-02 13:00 KST** 이후 새 작업 시작 금지.
마감 도달 시 → checkpoint + codex-to-claude handoff 작성 후 종료.

## 다음 권장 작업 (step44)

### 선택지 A — JA music_mixed 마지막 1% 밀기 (84 → 85)
- beam_size_ja=16 또는 beam_size_ja=18 로 재실행
- 또는 `_preprocess_ja_audio`에 spectral_floor 노이즈 억제 추가 (numpy fft 기반)
  ```python
  # noise floor estimate from first 0.5s of audio
  noise_frames = X[:int(0.5 * SAMPLE_RATE / 2)]
  noise_floor = np.abs(noise_frames).mean()
  X_mag = np.abs(X)
  X_suppressed = np.where(X_mag > noise_floor * 2, X, X * 0.1)
  ```
- JA music_mixed subset eval:
  `services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_stt_eval.py --url http://127.0.0.1:8799 --filter-lang ja --filter-source-type music_mixed --save ...`

### 선택지 B — 라이브 30분 검증 (권장 우선순위)
- 유튜브 일본어/영어 영상 30분 재생 후 자막 품질 육안 확인
- 지금 게이트는 PASS이므로 현실 테스트가 더 가치 있음

## 사이드카 재시작 명령
```powershell
$env:LOCAL_AI_PORT='8799'
$env:WHISPER_MODEL='medium'
$env:LOCAL_AI_STT_MODEL_JA='large-v3'
$env:LOCAL_AI_STT_BEAM_SIZE='10'
$env:LOCAL_AI_STT_BEAM_SIZE_JA='14'
$env:LOCAL_AI_STT_VAD_FILTER='false'
$env:LOCAL_AI_LLM_BACKEND='ollama'
$env:LOCAL_AI_LLM_MODEL='qwen2.5:7b-instruct-q4_K_M'
services/local-ai/.venv/Scripts/python.exe services/local-ai/main.py
```

## 토큰 90% 규칙
5시간 윈도우 90% 도달 시 즉시 작업 중단 → handoff 작성 후 종료.
