# Claude Handoff Prompt (Use when Codex token usage >= 93%)

아래 프롬프트를 Claude Code에 그대로 붙여넣어 이어서 작업한다.

```text
인수인계 모드로 전환.

먼저 아래 파일을 순서대로 읽고 현재 상태를 정확히 복구해:

1) .ops/ai-bridge/shared-context.md
2) .ops/task-log.md
3) 가장 최신 handoff 파일
   - 예: .ops/handoff-2026-04-28-1525-codex-to-claude-step26f-pipeline-entry-guard.md
4) 가장 최신 request/checkpoint 파일
   - .ops/ai-bridge/requests/
   - .ops/checkpoints/

다음 규칙으로 진행:
- 기존 변경을 절대 되돌리지 말 것 (특히 미커밋 파일 포함)
- 먼저 현재 브랜치 상태(git status, 최근 커밋) 요약
- 그 다음 마지막 진행 단계부터 바로 구현/검증 재개
- 검증 명령 실행 결과를 요약해서 보고
- 종료 전 반드시 handoff/checkpoint 문서 갱신

현재 우선순위:
1) 영어/일본어 번역 품질 개선(중국어 보류)
2) 언어 고정 모드에서 혼입 텍스트 차단 품질 점검
3) 설치본(NSIS) 재검증

마지막으로, 지금 세션에서 실제로 바꾼 파일 목록과 다음 액션 3개를 먼저 보고해.
```

## Quick command for user

Claude에 아주 짧게 지시할 때:

```text
"93% 인수인계 모드로 들어가서 .ops/ai-bridge/CLAUDE_93_PERCENT_PROMPT.md대로 진행해줘"
```

