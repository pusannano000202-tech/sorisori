# Request

- Topic: Step 10 완료 후 live 검증 및 다음 단계 진행 요청
- From: Claude Code
- To: Codex
- Goal: Step 10이 완료됐다. Codex는 전체 스택을 실제 환경에서 검증하고, 통과 시 Step 11(세션 ID 동적 입력 UI 또는 PostgreSQL 저장)을 진행한다.

## 이번 단계에서 변경된 것 (Step 10)

### 계약 변경
- `packages/contracts/src/realtime.ts`: `RealtimeSessionJoinMessage` 추가, `RealtimeGatewayClientMessage` 유니온에 추가

### 게이트웨이 변경
- `services/realtime/src/server.ts`:
  - `session.join` 핸들러 추가 — 오디오/OpenAI 브리지 없이 세션 구독만 등록
  - `upsertSession`에서 기존 join 클라이언트 자동 포함 (race condition 방지)

### pipeline 서비스 신규
- `services/pipeline/src/segment-store.ts` — in-memory SegmentStore
- `services/pipeline/src/gateway-client.ts` — WS 클라이언트 (자동 재연결 포함)
- `services/pipeline/src/server.ts` — HTTP 서버 (포트 8788)
- `services/pipeline/src/server.test.ts` — mock 게이트웨이 기반 통합 테스트

### REST API 엔드포인트
- `GET /health` — 헬스 + 세그먼트 수
- `GET /sessions` — 세션 목록
- `GET /sessions/:id/segments` — 세그먼트 배열
- `GET /sessions/:id/summary` — 원문/번역 텍스트 요약

## Codex 바로 실행할 검증 명령

```bash
# 터미널 1: 게이트웨이
OPENAI_API_KEY=sk-... npm run dev:realtime

# 터미널 2: 파이프라인
PIPELINE_SESSION_IDS=mvp-session-001 npm run dev:pipeline

# 터미널 3: 웹
NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:8787/ws \
NEXT_PUBLIC_DEFAULT_SESSION_ID=mvp-session-001 \
npm run dev:web
```

데스크톱 앱에서 세션 시작 (sessionId: `mvp-session-001`) → 30초 캡처 후:

```bash
curl http://localhost:8788/sessions/mvp-session-001/summary
curl http://localhost:8788/sessions/mvp-session-001/segments
```

## 검증 체크리스트

- [ ] pipeline `/health` 응답 `status: "ok"`
- [ ] 30초 후 `trackedSegments > 0`
- [ ] `/summary` 응답에 `translatedText` 비어있지 않음
- [ ] 웹 세션 화면에 자막 표시됨

## 다음 우선 단계 (Step 11 후보)

1. **세션 ID 동적 입력**: 웹 세션 화면에서 sessionId를 URL query param으로 받기 (`/session?id=...`)
2. **PostgreSQL 저장**: `services/pipeline`에 Prisma + PostgreSQL 연결, 세그먼트 영구 저장
3. **재연결 시 세그먼트 재조회**: pipeline 재시작 후 이전 세그먼트 복원

우선순위는 사용자/팀 판단에 맡긴다. live 검증 통과 후 바로 Step 11을 Claude에 handoff 가능.

## 주의사항
- `WASAPI loopback` + `wasapi` + `rubato + dasp` MVP 경로 유지
- `session.join`/`session.start` 이벤트 이름 변경 금지
- `services/realtime`의 OpenAI bridge 동작 유지
