# SoriSori

실시간 외국어 PC 오디오를 한국어 자막으로 바꿔주는 웹 + 데스크톱 앱 프로젝트입니다.

## 현재 단계

현재 저장소는 `Phase 0 / Step 1` 기준선이 잡힌 상태입니다.

- 기준 문서: `docs/PRD.md`, `docs/TRD.md`
- 운영 규칙: `.ops/`
- 앱/서비스/패키지 골격: `apps/`, `services/`, `packages/`

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

## 시작 순서

1. 문서 확인
2. 루트 워크스페이스 구조 유지
3. 웹 앱 골격 생성
4. 데스크톱 오디오 캡처 스파이크 진행

## 다음 구현 목표

- `apps/web`에 기본 UI 골격 생성
- `apps/desktop`에 Tauri 프로젝트 도입
- `services/realtime`와 `services/pipeline` 계약 정의
- Windows WASAPI loopback 캡처 스파이크
