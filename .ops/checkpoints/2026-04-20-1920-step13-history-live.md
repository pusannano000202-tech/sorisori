# Checkpoint

- Date: 2026-04-20 19:20
- Branch: `main`
- Topic: Step 13 complete - /history page wired to pipeline REST API

## Files changed

- `apps/web/src/app/history/page.tsx` — replaced static mock with SSR fetch

## What changed

- `HistoryPage` converted to `async` server component
- Calls `GET ${PIPELINE_API_URL}/sessions` (default `http://127.0.0.1:8788`)
- Maps `PipelineSessionEntry` → `SessionSummary` via `toSessionSummary()`
  - `title` = sessionId
  - `date` = `firstSegmentAt.slice(0,10)`
  - `durationLabel` = computed from `firstSegmentAt` ~ `lastSegmentAt` diff
  - `archiveStatus` = "saved" if totalSegments > 0, else "draft"
- On fetch error or pipeline down: returns `[]`, shows "저장된 세션이 없습니다."
- Each session card links to `/session?id=:sessionId`

## Verification

- `npx tsc -p apps/web/tsconfig.json --noEmit` → pass (no output)

## To verify live

```bash
# Start pipeline (in-memory mode is fine)
REALTIME_GATEWAY_WS_URL=ws://127.0.0.1:8787/ws \
PIPELINE_SESSION_IDS=mvp-session-001 \
npm run dev -w @sorisori/pipeline

# Start web
PIPELINE_API_URL=http://127.0.0.1:8788 \
npm run dev -w @sorisori/web

# Browse http://localhost:3000/history
# → Should show session list (or empty state if no segments yet)
```

## Next step candidates (Step 14+)

- 세션 상세 페이지 (`/session/[id]`) — 세그먼트 전체 목록 + 요약 뷰
- 인증 (로그인/회원가입) — NextAuth or JWT
- 배포 설정 — Docker Compose 전체 스택, Nginx
- capture-metrics 자동화 테스트
