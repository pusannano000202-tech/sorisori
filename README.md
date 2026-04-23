# SoriSori

실시간 외국어 PC 오디오를 한국어 자막으로 바꿔주는 웹 + 데스크톱 앱 프로젝트입니다.

## 현재 단계

현재 저장소는 `Phase 0 / Step 15` 기준으로, Windows MVP 핵심 파이프라인이 대부분 연결된 상태입니다.

- 기준 문서: `docs/PRD.md`, `docs/TRD.md`
- 운영 규칙: `.ops/`
- 앱/서비스/패키지 골격: `apps/`, `services/`, `packages/`
- 구현 완료 범위:
  - `apps/desktop`: WASAPI loopback 캡처, realtime uplink, transcript debug 화면
  - `services/realtime`: WebSocket gateway, OpenAI realtime transcription, DeepL translation
  - `services/pipeline`: 세션/세그먼트 저장, summary/segments REST API, PostgreSQL 저장 코드
  - `apps/web`: live viewer `/session`, history `/history`, archive detail `/session/[id]`

## 저장소 구조

```text
apps/
  web/        # 웹 앱
  desktop/    # Tauri 데스크톱 앱

services/
  realtime/   # 실시간 세션 게이트웨이
  pipeline/   # STT/번역 파이프라인

packages/
  contracts/  # 공통 타입, 이벤트, API 계약
  ui/         # 재사용 UI 컴포넌트
  config/     # 공통 설정
```

## 실행 순서

실행 전에 루트의 `.env.example` 값을 기준으로 필요한 환경 변수를 맞추면 됩니다.

1. `npm run dev:realtime`
2. `npm run dev:pipeline`
3. `npm run dev:web`
4. `npm run dev:desktop`

## 다음 구현 목표

- `OPENAI_API_KEY` + `DEEPL_API_KEY`로 전체 스택 live 검증
- desktop / web / pipeline 세션 ID 정렬 상태로 실세션 확인
- PostgreSQL migrate 및 영구 저장 검증
- pipeline 재시작 후 세그먼트 복원 전략 정리
