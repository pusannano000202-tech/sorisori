# Request

- Topic: Step 13 — /history 페이지에 pipeline API 연동 + 전체 스택 live 검증 가이드
- From: Claude Code
- To: Codex
- Goal: Step 12까지 완료된 코드베이스를 이어받아 Step 13을 진행한다.

---

## 현재 브랜치 및 커밋 상태

- Branch: `main`
- 최신 커밋: `b7897f4` (feat: add PostgreSQL + Prisma persistence to pipeline service)
- 작업 트리: 깨끗 (package-lock.json 변경만 있음, 무시 가능)

---

## Step 9~12에서 완료된 것 (Codex가 알아야 할 전체 그림)

### 데이터 흐름 (현재 완성된 경로)

```
Desktop (WASAPI loopback)
  → audio-chunk + capture-metrics (WebSocket)
  → services/realtime (port 8787)
      → OpenAI realtime transcription (gpt-4o-mini-transcribe)
      → transcription.completed → DeepL translation (DEEPL_API_KEY)
      → segment.upserted broadcast
  → services/pipeline (port 8788) [session.join 구독자]
      → SegmentStore (in-memory 또는 PostgreSQL)
      → REST API: /health, /sessions, /sessions/:id/segments, /sessions/:id/summary
  → apps/web (Next.js)
      → /session?id=... : TranscriptLane이 gateway WS에 session.join → 실시간 자막
      → /history : 현재 정적 mock (← 이번 Step 13 대상)
```

### 완성된 계약 이벤트 (이름 바꾸지 말 것)

| 이벤트 | 방향 | 의미 |
|---|---|---|
| `gateway.hello` | client→gateway | 역할 선언 |
| `session.start` | desktop→gateway | 오디오 세션 시작 + OpenAI 브리지 생성 |
| `session.join` | pipeline/web→gateway | 오디오 없이 세션 이벤트 구독만 |
| `audio.chunk.append` | desktop→gateway | PCM16 base64 청크 |
| `capture.metrics` | desktop→gateway | 오디오 품질 메트릭 |
| `session.stop` | desktop→gateway | 세션 종료 |
| `provider.state` | gateway→clients | OpenAI 연결 상태 |
| `transcription.delta` | gateway→clients | 전사 중간 결과 |
| `transcription.completed` | gateway→clients | 전사 확정 결과 |
| `segment.upserted` | gateway→clients | 번역 완성 세그먼트 |

### 핵심 파일 위치

```
packages/contracts/src/
  realtime.ts         ← 모든 WS 메시지 타입 (RealtimeSegmentUpsertedMessage 등)
  session.ts          ← TranscriptSegment, SessionLifecycleStatus
  events.ts           ← SessionEvent 타입들
  index.ts            ← re-export all

services/realtime/src/
  server.ts           ← WebSocket gateway (port 8787)
  openai-realtime-transcription.ts  ← OpenAI bridge
  deepl-translation.ts              ← DeepL HTTP 어댑터

services/pipeline/src/
  store-interface.ts  ← ISegmentStore 인터페이스
  segment-store.ts    ← in-memory 구현
  postgres-segment-store.ts ← Prisma/PostgreSQL 구현
  gateway-client.ts   ← gateway WS 구독 클라이언트
  server.ts           ← HTTP 서버 (port 8788)

services/pipeline/prisma/
  schema.prisma       ← Session + Segment 모델

apps/web/src/app/
  session/page.tsx        ← 세션 제어 화면 (서버 컴포넌트)
  session/SessionRuntime.tsx  ← /session?id=... 동적 세션 선택 (클라이언트)
  session/TranscriptLane.tsx  ← 실시간 자막 WS 연결 (클라이언트)
  history/page.tsx        ← 세션 기록 화면 (현재 정적 mock → Step 13 대상)

docker-compose.yml    ← PostgreSQL 16, port 5432, DB/user/pass: sorisori
```

### 환경 변수 전체 목록

```bash
# services/realtime
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe  # 기본값
DEEPL_API_KEY=...:fx  # free tier는 :fx 접미사
REALTIME_HOST=127.0.0.1
REALTIME_PORT=8787

# services/pipeline
DATABASE_URL=postgresql://sorisori:sorisori@localhost:5432/sorisori  # 미설정 시 in-memory
REALTIME_GATEWAY_WS_URL=ws://127.0.0.1:8787/ws
PIPELINE_SESSION_IDS=mvp-session-001  # 콤마로 다중 세션 구독 가능
PIPELINE_HOST=127.0.0.1
PIPELINE_PORT=8788

# apps/web
NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:8787/ws
NEXT_PUBLIC_DEFAULT_SESSION_ID=mvp-session-001
```

---

## Step 13 작업 내용

### 13-A: `/history` 페이지에 pipeline API 연동

**현재 상태**: `apps/web/src/app/history/page.tsx`가 정적 mock 3개를 하드코딩.

**목표**: pipeline의 `GET /sessions` + `GET /sessions/:id/summary`를 호출해 실제 데이터 표시.

**구현 방식**:
- Next.js 서버 컴포넌트에서 `fetch`로 pipeline API 호출 (SSR)
- `PIPELINE_API_URL` 환경 변수 (기본값 `http://127.0.0.1:8788`)
- pipeline이 응답 없으면 빈 목록 표시 (graceful fallback)
- 세션 클릭 시 `/session?id=:sessionId`로 이동

**pipeline `/sessions` 응답 형식**:
```json
{
  "sessions": [
    {
      "sessionId": "mvp-session-001",
      "totalSegments": 24,
      "firstSegmentAt": "2026-04-20T10:00:00.000Z",
      "lastSegmentAt": "2026-04-20T10:28:00.000Z"
    }
  ]
}
```

**pipeline `/sessions/:id/summary` 응답 형식**:
```json
{
  "sessionId": "mvp-session-001",
  "sourceText": "Hello world ...",
  "translatedText": "안녕 세계 ...",
  "segmentCount": 24,
  "firstSegmentAt": "...",
  "lastSegmentAt": "..."
}
```

**수정 대상 파일**:
- `apps/web/src/app/history/page.tsx` (서버 컴포넌트 fetch로 교체)

**주의**: `SessionSummary` 타입(`packages/contracts/src/session.ts`)은 `id`, `title`, `date`, `durationLabel`, `archiveStatus`, `sourceLanguage`, `targetLanguage` 필드를 가진다. pipeline API 응답과 직접 매핑이 안 되므로, 로컬 변환 함수를 써서 적절히 채워라. `title`은 sessionId로, `date`는 `firstSegmentAt` ISO 앞 10글자로, `durationLabel`은 firstSegmentAt~lastSegmentAt 차이로 계산하면 된다.

---

### 13-B: 전체 스택 live 검증 실행

**전제조건**: `OPENAI_API_KEY`, `DEEPL_API_KEY` 설정 필요.

**실행 순서**:
```bash
# 1. DB 시작 (선택사항 — DATABASE_URL 없으면 in-memory로도 됨)
docker compose up -d
DATABASE_URL=postgresql://sorisori:sorisori@localhost:5432/sorisori \
  npx prisma migrate dev --schema services/pipeline/prisma/schema.prisma --name init

# 2. gateway 시작
OPENAI_API_KEY=sk-... DEEPL_API_KEY=...:fx npm run dev:realtime

# 3. pipeline 시작
DATABASE_URL=postgresql://sorisori:sorisori@localhost:5432/sorisori \
REALTIME_GATEWAY_WS_URL=ws://localhost:8787/ws \
PIPELINE_SESSION_IDS=mvp-session-001 \
npm run dev:pipeline

# 4. 웹 시작
NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:8787/ws \
NEXT_PUBLIC_DEFAULT_SESSION_ID=mvp-session-001 \
PIPELINE_API_URL=http://127.0.0.1:8788 \
npm run dev:web

# 5. 데스크톱 앱 시작 → 세션 시작 (sessionId: mvp-session-001)
```

**검증 체크리스트**:
- [ ] `GET http://localhost:8787/health` → `status: "ok"`
- [ ] `GET http://localhost:8788/health` → `status: "ok"`, `backend: "postgresql"` (또는 `"in-memory"`)
- [ ] 30초 캡처 후 `GET http://localhost:8788/sessions/mvp-session-001/segments` → 세그먼트 배열 비어있지 않음
- [ ] `GET http://localhost:8788/sessions/mvp-session-001/summary` → `translatedText` 비어있지 않음
- [ ] 웹 `/session?id=mvp-session-001` 화면에 자막 표시됨
- [ ] 웹 `/history` 화면에 세션 목록 표시됨 (13-A 완료 후)

---

## 주의사항 (절대 바꾸지 말 것)

1. `WASAPI loopback` + `wasapi` crate + `rubato + dasp` — Rust 오디오 캡처 경로 유지
2. `session.join` / `session.start` 이벤트 이름 변경 금지
3. `transcription.delta` / `transcription.completed` / `segment.upserted` 이름 변경 금지
4. Rust 툴체인 `1.86.0` 고정 유지
5. `services/realtime`의 OpenAI bridge 동작 유지
6. Prisma 스키마 변경 시 반드시 `prisma migrate dev` 실행 후 체크포인트 남길 것

## 파일 수정 금지 (이번 Step 13 범위 밖)

- `apps/desktop/src-tauri/**`
- `apps/desktop/src/main.js`
- `services/realtime/src/openai-realtime-transcription.ts`
- `packages/contracts/src/realtime.ts` (계약 변경 필요시 Claude에 먼저 문의)

---

## 작업 완료 후 해야 할 것

1. `npm run check -w @sorisori/web` (또는 `npx tsc -p apps/web/tsconfig.json --noEmit`) 통과 확인
2. `.ops/task-log.md` 현재 단계 갱신
3. `.ops/checkpoints/2026-04-20-HHMM-step13-history-live.md` 체크포인트 작성
4. git commit

---

## 다음 이후 단계 후보 (Step 14+)

- 세션 상세 페이지 (`/session/[id]`) — 세그먼트 전체 목록 + 요약 뷰
- 인증 (로그인/회원가입) — Next.js + JWT or NextAuth
- 배포 설정 — Docker Compose 전체 스택, Nginx, 환경 분리
- capture-metrics 30초 검증 자동화 테스트
