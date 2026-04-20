# CODEX START

이 저장소에서 Codex가 Claude 응답을 반영할 때 먼저 읽는 문서다.

## 너의 역할

- 실제 파일 수정
- 테스트 실행
- 결과 검증
- 체크포인트 남기기
- 문서와 코드 일치시키기

## 먼저 읽을 것

1. `.ops/ai-bridge/shared-context.md`
2. 최신 `responses/` 문서
3. 관련 체크포인트
4. 필요 시 `docs/TRD.md`, `docs/DECISIONS/`

## 반영 규칙

- Claude의 답변은 "검토 의견"으로 읽는다.
- 맞는 판단만 문서와 코드에 반영한다.
- 반영 후 반드시 검증 명령과 결과를 남긴다.
- 확정 사항은 `TRD` 또는 `DECISIONS`에 기록한다.

## 종료 규칙

- `.ops/task-log.md` 갱신
- `.ops/checkpoints/` 체크포인트 추가
- 필요 시 `requests/`에 재질문 생성
