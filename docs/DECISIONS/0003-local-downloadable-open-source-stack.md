# Decision 0003 - Local Downloadable Open-Source Stack Pivot

- Date: 2026-04-22
- Status: Proposed
- Owner: Codex

## Context

현재 구현은 다음 구조를 기준으로 작동한다.

- desktop app: `WASAPI loopback` 시스템 오디오 캡처
- realtime gateway: WebSocket 세션/이벤트 브리지
- transcription: OpenAI realtime transcription
- translation: DeepL text translation
- pipeline: 세그먼트 저장/요약/조회
- web: live viewer + history + session detail

사용자 목표가 "사용자가 다운로드해서 자기 컴퓨터에서 실행하는 구조"로 이동하면서, 사용량 기반 외부 API 비용(OpenAI/DeepL)을 제거하는 방향이 필요해졌다.

## Decision

다음 원칙으로 로컬 오픈소스 피벗을 검토한다.

1. 데스크톱 앱, 캡처 계층, UI, 세그먼트 모델은 최대한 유지한다.
2. 외부 API provider를 로컬 STT/번역 엔진으로 교체한다.
3. 초기 목표는 "중간급~게임용 PC"에서 돌아가는 다운로드형 Windows 앱이다.
4. 로컬 배포 모드에서는 중앙 서버 의존을 줄이고, 필요 시 `services/realtime`와 `services/pipeline`을 로컬 프로세스로 재사용한다.

## Likely Direction

### STT

- 1순위 후보: `faster-whisper`
- 2순위 후보: `whisper.cpp`

이유:

- `faster-whisper`는 CUDA가 있는 게임용 PC에서 성능이 좋고, CPU INT8 경로도 현실적이다.
- `whisper.cpp`는 배포/번들링 단순성이 좋고 C/C++ 기반이라 데스크톱 통합이 매력적이다.

### Translation

- 1순위 후보: `Argos Translate`
- 2순위 후보: `LibreTranslate`

이유:

- 다운로드형 오프라인 앱에서는 `Argos Translate`가 더 직접적이다.
- `LibreTranslate`는 로컬 HTTP 서비스로 감싸기 쉽지만, 앱 내부 동작보다 서버형에 더 가깝다.

## Scope That Stays

- `apps/desktop` 캡처/세션 제어
- `packages/contracts` 세그먼트/세션 이벤트 구조
- `apps/web` UI 구조
- `services/pipeline` 저장/조회 계층

## Scope That Likely Changes

- `services/realtime/src/openai-realtime-transcription.ts`
- `services/realtime/src/deepl-translation.ts`
- 환경 변수 중심의 원격 provider 설정
- 배포 전략: 웹 + 서버 중심에서 "다운로드형 데스크톱 + 선택적 웹 보조"로 변경

## Open Questions

1. 로컬 배포 모드에서 `services/realtime`를 별도 로컬 프로세스로 둘지, desktop 내부 엔진으로 흡수할지
2. 모델 파일을 설치 번들에 포함할지, 첫 실행 시 다운로드할지
3. 저사양 / 중간 / 게임용 PC별 기본 모델 프리셋을 어떻게 나눌지
4. 번역 품질과 속도 중 어느 쪽을 우선할지

## Immediate Next Step

Claude Code에게 다음을 요청한다.

- 로컬 오픈소스 피벗의 정확한 파일 단위 실행 계획
- `faster-whisper` vs `whisper.cpp` 추천안
- `Argos Translate` vs `LibreTranslate` 추천안
- 다운로드형 배포/모델 관리 전략
