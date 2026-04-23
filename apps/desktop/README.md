# Desktop App

Tauri 기반 데스크톱 앱 워크스페이스입니다.

현재 포함 범위:

- Tauri v2 앱 골격
- Windows WASAPI loopback 런타임 프로브
- persistent capture worker + start/stop command
- `capture-session`, `capture-metrics`, `audio-chunk` 이벤트 브리지
- `services/realtime` WebSocket uplink 연결
- transcript / gateway / metrics debug 화면
- 공유 세션 ID 입력 UI (`mvp-session-001` 기본)
- Rust 1.86.0 로컬 툴체인 고정
- 빌드 검증용 플레이스홀더 아이콘

다음 단계:

- 실세션 live 검증
- 공유 세션 ID를 기준으로 web / pipeline과 end-to-end 확인
- 사용자용 세션 제어 UI와 기록 export UX 정리

메모:

- 현재 `src-tauri/icons/icon.ico`는 임시 아이콘이다.
- 브랜딩 단계에서 실제 앱 아이콘 세트로 교체한다.
- desktop의 세션 ID는 web 기본값과 pipeline 구독 세션 ID를 맞출 때 가장 중요하다.
