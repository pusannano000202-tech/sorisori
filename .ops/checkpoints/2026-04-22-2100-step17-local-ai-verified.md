# Checkpoint — Step 17 Local AI Service Verified

- Date: 2026-04-22
- Step: 17
- Branch: main

## 완료된 것

- Python 3.12 venv: `services/local-ai/.venv/`
- 의존성 설치: faster-whisper 1.1.1, argostranslate 1.9.6, fastapi, uvicorn, numpy
- 모델 다운로드: faster-whisper base (`~/.../AppData/Roaming/sorisori/models/`) + Argos en→ko 팩
- 포트 수정: local-ai 기본 포트 8788 → **8789** (pipeline이 8788 사용)
- `package.json`: `dev:local-ai` 스크립트 추가
- `.env.example`: LOCAL_AI_URL, WHISPER_MODEL, WHISPER_DEVICE 항목 추가
- `.gitignore`: .venv/, __pycache__/, *.pyc 추가

## 검증 결과

| 엔드포인트 | 결과 |
|---|---|
| `GET /health` | `whisper_ready: true, argos_ready: true` |
| `POST /translate` "Hello, this is a test." | `"안녕하세요, 이것은 테스트입니다."` |
| `POST /transcribe` (사인파 오디오) | transcript 반환 정상 |

## 사용법

```bash
# 모델 다운로드 (최초 1회)
python services/local-ai/model-download.py

# 서비스 기동
npm run dev:local-ai

# .env에 추가
LOCAL_AI_URL=http://127.0.0.1:8789
```

## 다음 단계 (Step 18)

1. `LOCAL_AI_URL` 설정 후 realtime + local-ai 동시 기동
2. desktop에서 세션 시작 → 실제 시스템 오디오 → 로컬 전사 → 한국어 자막 end-to-end 검증
3. Tauri sidecar 패키징 방식 검토 (Python 런타임 번들링)
