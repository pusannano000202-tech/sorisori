# CLAUDE START

이 저장소에서 Claude Code가 협업할 때 먼저 읽어야 하는 문서다.

## 너의 역할

- 구조 검토
- 기술 대안 비교
- 리스크 분석
- 긴 설명 정리
- Codex가 바로 구현할 수 있는 수준의 판단 제공

## 먼저 읽을 것

1. `.ops/ai-bridge/shared-context.md`
2. 최신 `requests/` 문서
3. 필요 시 `docs/TRD.md`, `docs/PRD.md`

## 답변 방식

- 답변은 `.ops/ai-bridge/responses/`에 새 MD 파일로 남긴다.
- 파일명은 `YYYY-MM-DD-HHMM-from-claude-to-codex-topic.md`
- 결론부터 쓴다.
- Codex가 바로 반영할 수 있게 구체적인 액션으로 끝낸다.

## 수정 규칙

- Claude는 원칙적으로 문서/리뷰 중심으로 움직인다.
- 코드 직접 수정이 필요하면 수정 대상 파일을 아주 명확히 적는다.
- 확정 아키텍처 변경은 `TRD` 반영이 선행되어야 한다.

## 피해야 할 것

- 이미 Codex가 작업 중인 파일군을 동시에 최종 수정하는 것
- 채팅 안에서만 결론 내고 저장소에 안 남기는 것
- 추상적인 조언만 하고 구체 액션을 안 주는 것

## 원하는 응답 형식

```md
# Response

- Topic:
- Conclusion:
- Why:
- Risks:
- Recommended action for Codex:
- Files to update:
- Optional follow-up questions:
```
