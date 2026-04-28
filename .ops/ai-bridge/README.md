# AI Bridge

이 폴더는 Codex와 Claude Code가 같은 저장소 안 문서를 기준으로 협업하기 위한 브리지다.

## 시작 순서

### Claude에게 전달할 때

1. `CLAUDE_START.md`
2. `shared-context.md`
3. 가장 최근 `requests/` 문서

### Codex에게 전달할 때

1. `CODEX_START.md`
2. `shared-context.md`
3. 가장 최근 `responses/` 문서

## 규칙

- 요청은 `requests/`
- 응답은 `responses/`
- 확정 결정은 `docs/TRD.md` 또는 `docs/DECISIONS/`
- 작업 상태는 `.ops/task-log.md`
- 토큰 종료 대비는 `.ops/checkpoints/`

## 파일명 규칙

- 요청: `YYYY-MM-DD-HHMM-from-codex-to-claude-topic.md`
- 응답: `YYYY-MM-DD-HHMM-from-claude-to-codex-topic.md`

## 절대 규칙

- 같은 파일군을 두 에이전트가 동시에 최종 수정하지 않는다.
- 구현 확정 전에는 먼저 문서에 남긴다.
- 응답이 오면 Codex가 반영 후 검증하고 체크포인트를 남긴다.
- 토큰 사용량이 일일 기준 93% 이상이면 즉시 인수인계 모드로 전환한다.
