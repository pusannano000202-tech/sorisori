# 0001 - Windows 오디오 캡처 전략

- 상태: Accepted
- 날짜: 2026-04-19

## 배경

이 제품의 핵심은 "컴퓨터에서 나오는 소리"를 안정적으로 받는 것이다. MVP 대상은 Windows이며, 사용자가 별도 드라이버나 가상 오디오 케이블을 설치하지 않고 바로 써보는 경험이 중요하다.

## 결정

Windows MVP의 시스템 오디오 캡처는 Tauri의 Rust 계층에서 WASAPI loopback으로 직접 구현한다. Rust 라이브러리는 `wasapi` crate를 우선 사용한다.

## 이유

- Microsoft 공식 문서는 WASAPI loopback으로 렌더링 엔드포인트에서 재생 중인 오디오 스트림을 캡처할 수 있다고 설명한다.
- Microsoft 공식 문서는 loopback이 shared mode에서 동작한다고 명시한다.
- `wasapi` crate 문서는 loopback capture를 지원한다고 밝히고, `loopback`, `record_application` 예제를 제공한다.
- 별도 `Virtual Audio Cable` 설치를 요구하지 않아 초기 진입장벽이 낮다.
- Tauri + Rust 구조와 잘 맞는다.

## 대안

### Virtual Audio Cable

- 장점: 구현이 단순할 수 있다.
- 단점: 설치 장벽이 크고 사용자 경험이 나빠진다.

### `cpal` 직접 사용

- 장점: 추상화가 넓고 향후 크로스플랫폼 구조에 유리할 수 있다.
- 단점: 현재 MVP 핵심 요구인 Windows loopback 캡처 관점에서는 `wasapi`보다 직접성이 떨어진다.

## 영향

- `apps/desktop` 또는 오디오 네이티브 모듈에 Windows 전용 구현이 들어간다.
- 캡처 모듈은 추후 `SystemAudioCapture` 인터페이스 뒤로 숨긴다.
- macOS/Linux는 이후 별도 구현으로 확장한다.
