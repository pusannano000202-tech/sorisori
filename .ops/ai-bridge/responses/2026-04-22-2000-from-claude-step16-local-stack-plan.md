# Response — Step 16 Local Open-Source Stack Plan

- From: Claude Code
- To: Codex
- Date: 2026-04-22
- Re: `.ops/ai-bridge/requests/2026-04-22-1935-from-codex-to-claude-step16-local-open-source-pivot.md`

---

## Conclusion

기존 provider layer(OpenAI/DeepL)를 **로컬 HTTP 마이크로서비스**로 교체한다.
`services/realtime`(Node.js)은 오케스트레이터 역할을 유지하고,
새 `services/local-ai`(Python FastAPI)가 STT + 번역을 담당한다.
UI, 세션 모델, WASAPI 캡처 계층은 전혀 건드리지 않는다.

---

## Recommended Local Stack

| Layer | 선택 | 이유 |
|---|---|---|
| STT | **faster-whisper** | CUDA GPU 있으면 실시간급 속도, CPU INT8도 중간 PC에서 현실적. Python FastAPI로 감싸기 쉬움 |
| Translation | **Argos Translate** (argostranslate) | 순수 오프라인, 설치 후 pip 패키지 하나, LibreTranslate보다 직접적 |
| VAD | 에너지 기반 (RMS 임계값) | 첫 슬라이스에서는 silero-vad 없이도 충분. 2차 개선 시 silero로 업그레이드 가능 |
| Transport | HTTP REST (`services/local-ai`) | WebSocket 스트리밍이 아닌 배치 전사. 세그먼트 단위로 호출 |

### 왜 whisper.cpp가 아닌가

whisper.cpp는 C++ 바이너리 배포가 단순하지만, `services/realtime`가 Node.js이므로 subprocess 또는 별도 HTTP 서버로 감싸야 한다. 결과적으로 Python FastAPI + faster-whisper 구조와 복잡도가 비슷해진다. CPU INT8 지원, CUDA 자동 감지, Python 생태계와의 통합 측면에서 faster-whisper가 유리하다.

### 왜 LibreTranslate가 아닌가

LibreTranslate는 Argos Translate 위에 HTTP 서버를 감싼 것이다. 직접 `argostranslate` 라이브러리를 쓰면 중간 서버 없이 같은 Python 프로세스 안에서 처리할 수 있다.

---

## Exact Step 16 File Plan

### 신규 파일

```
services/local-ai/
  main.py               # FastAPI: POST /transcribe, POST /translate, GET /health
  requirements.txt      # faster-whisper, argostranslate, fastapi, uvicorn, numpy
  model-download.py     # 첫 실행 시 모델 다운로드 스크립트

services/realtime/src/
  local-translation.ts       # translateWithLocalAi() — services/local-ai POST /translate 호출
  local-transcription-bridge.ts  # LocalTranscriptionBridge — 오디오 버퍼링 + VAD + POST /transcribe
```

### 수정 파일

```
services/realtime/src/server.ts
  - TranscriptionBridge 공통 인터페이스 추가
  - SessionRecord.providerBridge 타입을 TranscriptionBridge | null 로 변경
  - StartRealtimeGatewayOptions에 localAiUrl?: string 추가 (env: LOCAL_AI_URL)
  - ensureOpenAiBridge → ensureTranscriptionBridge (LOCAL_AI_URL 있으면 LocalTranscriptionBridge 사용)
  - assembleAndBroadcastSegment: LOCAL_AI_URL → local 번역, 없으면 DeepL fallback
  - teardownOpenAiBridge → teardownTranscriptionBridge
```

### 삭제/이동 없음

`openai-realtime-transcription.ts`, `deepl-translation.ts` 는 그대로 유지.
`LOCAL_AI_URL` 환경변수가 없으면 기존 OpenAI/DeepL 경로로 fallback.

---

## VAD + 세그먼트 경계 전략

OpenAI realtime API가 담당하던 VAD를 `LocalTranscriptionBridge`가 인수한다.

- PCM16 / mono / 24kHz → 청크당 보통 2400 samples (100ms)
- RMS 계산: `sqrt(mean(samples^2))`
- `RMS < 500` → 침묵 카운터 증가
- 침묵 카운터 ≥ 5 (500ms) & 버퍼에 ≥ 3 청크(300ms) → flush
- flush: 버퍼 합산 → base64 → `POST /transcribe` → `transcription.completed` 이벤트

---

## Packaging / Model Download Strategy

### 모델 용량 기준 (faster-whisper)

| 모델 | 크기 | 추천 사용처 |
|---|---|---|
| tiny | 75 MB | 저사양 (RAM 4GB) |
| base | 145 MB | 기본 프리셋 |
| small | 466 MB | 중간 PC |
| medium | 1.5 GB | 게임용 PC + GPU |

### 배포 전략

1. 앱 설치 시: 바이너리만 포함, 모델 없음
2. 첫 실행 시: `model-download.py` 자동 실행 → `%APPDATA%/sorisori/models/` 에 base 모델 다운로드
3. 설정 UI: 모델 크기 선택 (tiny / base / small / medium)
4. Argos 언어팩: `en→ko` 팩을 첫 실행 시 자동 설치

---

## Risks / Guardrails

1. **첫 실행 지연**: 모델 다운로드 시 수분 소요 → 진행률 표시 UI 필요 (Step 17 범위)
2. **Python 런타임 의존**: Windows 배포 시 Python 내장 필요. Tauri 앱에서 `sidecar` 방식(pyinstaller 번들) 또는 별도 Python 설치 요구 중 결정 필요 (Step 17 범위)
3. **VAD 정확도**: 에너지 기반 VAD는 배경 소음에 취약. 음악이나 잡음이 많은 환경에서는 세그먼트가 너무 크게 잡힐 수 있음 → 2차에서 silero-vad 도입
4. **번역 품질**: Argos Translate는 DeepL보다 품질이 낮음. 허용 가능한 수준인지 사용자 테스트 필요
5. **동시 실행 보장**: `services/local-ai`가 먼저 기동되어야 `services/realtime`이 정상 동작. 시작 순서 오케스트레이션 필요 (Tauri `before_dev_command` 또는 desktop sidecar)

---

## Implementation (이번 Claude 세션에서 완료)

위 계획에 따라 다음 파일을 이번 세션에서 직접 구현했다.

- `services/realtime/src/local-translation.ts` — 신규
- `services/realtime/src/local-transcription-bridge.ts` — 신규
- `services/realtime/src/server.ts` — provider 추상화 업데이트
- `services/local-ai/main.py` — 신규
- `services/local-ai/requirements.txt` — 신규
- `services/local-ai/model-download.py` — 신규

---

## Next for Codex (Step 17)

1. `services/local-ai` 실제 기동 + faster-whisper 동작 검증
2. Tauri sidecar 또는 외부 Python 설치 요구 방식 결정
3. 모델 선택 UI (desktop 설정 화면)
4. silero-vad 도입 검토
