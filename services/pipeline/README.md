# Pipeline Service

세그먼트 저장 및 세션 요약 서비스.

## 역할

- `services/realtime` 게이트웨이에서 `segment.upserted` 이벤트를 수신해 메모리에 저장한다.
- REST API로 세션별 세그먼트 목록과 번역 요약을 제공한다.

## 실행

```bash
# PostgreSQL 없이 in-memory 모드로 시작
REALTIME_GATEWAY_WS_URL=ws://127.0.0.1:8787/ws \
PIPELINE_SESSION_IDS=mvp-session-001 \
npm run dev -w @sorisori/pipeline

# PostgreSQL 영구 저장 모드로 시작 (docker-compose.yml 이용)
docker compose up -d
npx prisma migrate dev --schema services/pipeline/prisma/schema.prisma --name init
DATABASE_URL=postgresql://sorisori:sorisori@localhost:5432/sorisori \
REALTIME_GATEWAY_WS_URL=ws://127.0.0.1:8787/ws \
PIPELINE_SESSION_IDS=mvp-session-001 \
npm run dev -w @sorisori/pipeline
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PIPELINE_HOST` | `127.0.0.1` | HTTP 서버 바인드 주소 |
| `PIPELINE_PORT` | `8788` | HTTP 서버 포트 |
| `REALTIME_GATEWAY_WS_URL` | `ws://127.0.0.1:8787/ws` | 게이트웨이 WebSocket URL |
| `PIPELINE_SESSION_IDS` | `mvp-session-001` | 구독할 세션 ID (콤마 구분) |
| `DATABASE_URL` | 없음 | 설정 시 PostgreSQL 저장, 미설정 시 in-memory |

## REST API

| 엔드포인트 | 설명 |
|---|---|
| `GET /health` | 헬스 체크, 세션/세그먼트 수 포함 |
| `GET /sessions` | 추적 중인 세션 목록 |
| `GET /sessions/:id/segments` | 세션의 전체 세그먼트 배열 |
| `GET /sessions/:id/summary` | 세션의 원문/번역 텍스트 요약 |

## 연결 방식

pipeline 서비스는 `session.join` 메시지로 게이트웨이에 세션 구독을 등록한다.
오디오를 생성하거나 OpenAI 연결을 만들지 않는다.
게이트웨이 연결이 끊기면 3초 후 자동으로 재연결을 시도한다.
