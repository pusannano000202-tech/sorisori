# AI Collaboration Protocol

- 문서 버전: v0.1
- 작성일: 2026-04-20
- 목적: Codex와 Claude Code가 같은 저장소를 기준으로 끊김 없이 협업하도록 하는 운영 규약

## 1. 이 방식이 가능한 조건

이 저장소 안에 남긴 Markdown 파일을 두 에이전트가 공통 기준으로 읽고 쓸 수 있으면 협업이 가능하다.

중요한 점:

- 자동으로 서로 "대화"하는 것은 아니다.
- 한쪽이 남긴 MD 파일을 다른 쪽이 읽는 방식이다.
- 즉, 실제 동작은 `공유 문서 기반 비동기 협업`에 가깝다.

## 2. 기본 원칙

- 기준 문서는 채팅이 아니라 저장소 안 파일이다.
- 작업 지시는 `.ops/ai-bridge/requests/`에 남긴다.
- 답변은 `.ops/ai-bridge/responses/`에 남긴다.
- 최종 합의나 확정 결정은 `docs/DECISIONS/` 또는 `docs/TRD.md`에 반영한다.
- 같은 파일군은 한 번에 한 에이전트만 최종 수정한다.

## 3. 폴더 역할

```text
.ops/ai-bridge/
  README.md
  CLAUDE_START.md
  CODEX_START.md
  requests/
  responses/
  shared-context.md
  command-cheatsheet.md
```

- `README.md`: 전체 규칙
- `CLAUDE_START.md`: Claude에게 먼저 읽히는 문서
- `CODEX_START.md`: Codex에게 먼저 읽히는 문서
- `requests/`: 질문/검토 요청
- `responses/`: 답변/리뷰 결과
- `shared-context.md`: 현재 프로젝트 상태 요약
- `command-cheatsheet.md`: Claude가 Codex CLI 스타일 작업 요청을 만들 때 참고할 명령

## 4. 권장 역할 분리

### Codex

- 실제 파일 수정
- 테스트 실행
- 리팩터링
- 스캐폴드 생성
- 구현 후 검증 결과 문서화

### Claude Code

- 구조 검토
- 기술 대안 비교
- 위험 분석
- 긴 명세 초안
- "이 구현 방향이 맞는지" 리뷰

## 5. 요청 파일 규칙

파일명 규칙:

- `YYYY-MM-DD-HHMM-from-codex-to-claude-topic.md`
- `YYYY-MM-DD-HHMM-from-claude-to-codex-topic.md`

요청 파일에는 최소한 아래가 들어간다.

- 목적
- 읽어야 할 파일
- 확인해줬으면 하는 질문
- 수정 금지 파일
- 답변 형식

## 6. 응답 파일 규칙

응답 파일에는 최소한 아래가 들어간다.

- 결론
- 이유
- 리스크
- 권장 다음 단계
- Codex가 바로 적용할 수 있는 수준의 액션

## 7. 실제 운영 흐름

### Codex -> Claude

1. Codex가 `.ops/ai-bridge/requests/`에 질문 파일 작성
2. 사용자가 Claude에게 해당 파일부터 읽으라고 전달
3. Claude가 `.ops/ai-bridge/responses/`에 답변 작성
4. Codex가 답변 읽고 코드/문서 반영
5. 확정 사항은 `TRD` 또는 `DECISIONS`에 반영

### Claude -> Codex

1. Claude가 구현 요청 또는 리뷰 결과를 `responses/`에 작성
2. Codex가 읽고 실제 파일 수정
3. 적용 후 결과를 체크포인트와 작업 로그에 남김

## 8. 중요한 현실 체크

이 구조는 "상당히 잘 굴러가는 협업"은 만들 수 있지만, 외부 도구끼리 자동 RPC처럼 붙는 것은 아니다.

즉, 지금 업데이트 가능한 범위는 아래다.

- 같은 저장소 안에서 읽고 쓰는 협업 규칙 만들기
- Claude용 시작 문서 만들기
- Codex용 시작 문서 만들기
- 요청/응답 템플릿 만들기
- 현재 프로젝트 상태를 공유 컨텍스트 문서로 정리하기

반대로 지금 당장 자동으로 안 되는 것:

- Claude가 내 세션을 실시간으로 직접 읽는 것
- 내가 Claude 세션을 실시간으로 직접 호출하는 것
- 별도 브리지 서버 없이 자동 메시지 왕복하는 것

## 9. 추천 사용법

Claude에게는 먼저 아래 순서로 읽히면 된다.

1. `.ops/ai-bridge/CLAUDE_START.md`
2. `.ops/ai-bridge/shared-context.md`
3. 가장 최근 `requests/` 파일
4. 필요 시 `docs/TRD.md`, `docs/PRD.md`

Codex에게는 아래 순서가 좋다.

1. `.ops/ai-bridge/CODEX_START.md`
2. `.ops/ai-bridge/shared-context.md`
3. 가장 최근 `responses/` 파일
4. 필요 시 체크포인트와 작업 로그

## 10. 현재 프로젝트 기준 결론

2026-04-20 기준 이 저장소는 이미 체크포인트와 작업 로그 체계가 있으므로, MD 기반 협업 브리지를 추가하기에 아주 좋은 상태다.

즉, 답은:

- 가능하다.
- 지금 상태에서 바로 붙일 수 있다.
- 다만 "자동 대화"가 아니라 "공유 MD 프로토콜"로 붙는 방식이다.
