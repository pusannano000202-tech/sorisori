# Shared Context

- 프로젝트: 컴퓨터/노트북 등에서 재생되는 외국어 오디오를 실시간 한국어 자막으로 보여주는 웹 + 데스크톱 앱
- 현재 날짜 기준 문맥: 2026-04-20
- 기준 문서: `docs/PRD.md`, `docs/TRD.md`

## 지금까지 완료

- PRD/TRD 작성
- 체크포인트/핸드오프 체계 작성
- 웹 앱 기본 골격 구축
- 공통 계약 패키지 구축
- Tauri 데스크톱 앱 골격 구축
- Rust 1.86.0 로컬 툴체인 고정
- Windows WASAPI loopback 런타임 프로브 구현
- loopback preview -> PCM16/mono/24kHz 변환 진단 구현

## 현재 기술 기준

- Windows MVP 오디오 캡처: `wasapi`
- Windows MVP 캡처 전략: `WASAPI loopback`
- 포맷 변환: `rubato + dasp`
- 실시간 전사: OpenAI realtime transcription
- 번역: DeepL text translation

## 현재 다음 우선순위

1. 짧은 loopback 프로브를 장시간 capture worker로 승격
2. 변환된 청크를 realtime 업링크 계약에 연결
3. 웹 세션 상태 이벤트와 desktop 세션 제어 연결

## 지금 주의할 점

- `cpal` 메인 캡처 엔진으로 회귀하지 않는다.
- Rust 툴체인 핀 `1.86.0`은 유지한다.
- 같은 파일군을 Codex와 Claude가 동시에 최종 수정하지 않는다.
- 확정 설계 변경은 먼저 문서에 남긴다.
