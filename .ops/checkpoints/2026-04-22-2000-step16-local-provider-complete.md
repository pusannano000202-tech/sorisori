# Checkpoint — Step 16 Local Provider Complete

- Date: 2026-04-22
- Step: 16
- Branch: main

## 완료된 것

- `packages/contracts`: `RealtimeProviderStateMessage.provider`에 `"local-ai-transcription"` 추가
- `services/realtime/src/local-translation.ts`: `translateWithLocalAi()` 신규
- `services/realtime/src/local-transcription-bridge.ts`: `LocalTranscriptionBridge` 신규 (에너지 VAD + 배치 전사)
- `services/realtime/src/server.ts`: `TranscriptionBridge` 인터페이스 추상화, `LOCAL_AI_URL` env 지원, provider 선택 로직
- `services/local-ai/main.py`: FastAPI STT+번역 서비스 신규
- `services/local-ai/requirements.txt`, `model-download.py` 신규
- `services/realtime` tsc check 통과

## 환경 변수

| 변수 | 설명 | 기본값 |
|---|---|---|
| `LOCAL_AI_URL` | local-ai 서비스 base URL | 없음 (OpenAI fallback) |
| `WHISPER_MODEL` | faster-whisper 모델 크기 | `base` |
| `WHISPER_DEVICE` | 인퍼런스 디바이스 | `auto` |
| `LOCAL_AI_HOST` | local-ai 서비스 바인드 호스트 | `127.0.0.1` |
| `LOCAL_AI_PORT` | local-ai 서비스 포트 | `8788` |

## 다음 단계 (Step 17)

1. Python 가상환경 구성 + `pip install -r services/local-ai/requirements.txt`
2. `python services/local-ai/model-download.py` 실행 (base 모델 + Argos en→ko 팩 다운로드)
3. `python services/local-ai/main.py` 기동 → `GET /health` 확인
4. `.env`에 `LOCAL_AI_URL=http://127.0.0.1:8788` 추가 후 realtime 서비스 재기동
5. desktop에서 세션 시작 → 로컬 전사 이벤트 확인
