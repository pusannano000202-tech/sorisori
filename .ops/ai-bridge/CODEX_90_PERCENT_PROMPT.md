# Codex 90% Handoff Prompt

아래 지시를 그대로 따르세요.

## 전환 조건
- 세션 사용량이 90% 이상이거나, 리셋까지 30분 이내면 즉시 **handoff 모드**로 전환.

## handoff 모드 우선순위
1. 새 기능 개발 중단 (치명 버그 수정 제외)
2. 재현 가능한 상태 고정
3. 문서화 + 커밋 + 다음 실행 가이드 작성

## 필수 산출물
- 체크포인트:
  - `.ops/checkpoints/YYYY-MM-DD-<step>.md`
- 인수인계:
  - `.ops/handoff-YYYY-MM-DD-codex-to-claude-<step>.md`
- 공용 컨텍스트:
  - `.ops/ai-bridge/shared-context.md`

## 체크포인트 템플릿
- 이번 단계 목표
- 실제 변경 파일 목록
- 실행한 커맨드
- 검증 결과(성공/실패 수치)
- 블로커/리스크
- 다음 3개 액션

## 인수인계 템플릿
- 현재 상태 한 줄 요약
- 마지막 정상 커밋 해시
- 남은 작업과 권장 순서
- 즉시 실행 커맨드 3개
- 주의사항(데이터 손실 위험/환경 변수/포트 충돌)

## 커밋 규칙
- 가능한 경우 handoff 전용 커밋 1개 남기기
- 커밋 메시지 예:
  - `docs(handoff): prepare 90-percent context for next operator`

## 금지
- `git reset --hard`, `git clean -fd` 등 파괴적 명령
- 근거 없는 완료 보고
