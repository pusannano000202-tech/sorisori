# Desktop App

Tauri 기반 데스크톱 앱 워크스페이스입니다.

현재 포함 범위:

- Tauri v2 앱 골격
- Windows WASAPI loopback 런타임 프로브
- 짧은 capture preview 기반 포맷 변환 진단
- 정적 프런트엔드와 Rust 명령 연결 예시
- Rust 1.86.0 로컬 툴체인 고정
- 빌드 검증용 플레이스홀더 아이콘

다음 단계:

- 실제 장시간 loopback worker로 승격
- realtime 서비스 업링크 연결
- 세션 제어 UI와 연결

메모:

- 현재 `src-tauri/icons/icon.ico`는 임시 아이콘이다.
- 브랜딩 단계에서 실제 앱 아이콘 세트로 교체한다.
- 현재 프로브는 "짧게 열고 상태를 읽는 진단용"이며, 장시간 스트리밍 워커는 다음 단계다.
