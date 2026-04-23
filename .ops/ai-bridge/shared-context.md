# Shared Context

- 프로젝트: 컴퓨터/노트북 등에서 재생되는 외국어 오디오를 실시간 한국어 자막으로 보여주는 웹 + 데스크톱 앱
- 현재 날짜 기준 문맥: 2026-04-22
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
- persistent `WASAPI loopback` worker 및 desktop start/stop 세션 구현
- desktop -> realtime gateway 업링크 및 metrics 브리지 구현
- OpenAI realtime transcription bridge 구현
- desktop 디버그 화면에 gateway/transcript 패널 연결
- DeepL 번역이 포함된 `segment.upserted` 브로드캐스트 구현
- `services/pipeline` in-memory segment store + REST API 구현
- 웹 세션 화면에서 `session.join` 기반 viewer 구독 및 `/session?id=...` 라우팅 구현
- 웹 기록 화면에서 pipeline `/sessions`를 SSR로 조회
- `/session/[id]` 세션 상세 페이지에서 요약/세그먼트 아카이브 조회 구현
- desktop/web/pipeline 세션 ID 정렬 및 live 검증 준비 완료

## 현재 기술 기준

- Windows MVP 오디오 캡처: `wasapi`
- Windows MVP 캡처 전략: `WASAPI loopback`
- 포맷 변환: `rubato + dasp`
- 실시간 전사: `LOCAL_AI_URL` 있으면 faster-whisper (services/local-ai), 없으면 OpenAI realtime transcription fallback
- 번역: `LOCAL_AI_URL` 있으면 argostranslate (services/local-ai), 없으면 DeepL fallback
- 로컬 AI 서비스: `services/local-ai/main.py` (FastAPI, port 8788 기본)

## 현재 다음 우선순위

1. `services/local-ai` 실제 기동 및 faster-whisper 동작 검증 (Python 환경 구성)
2. Tauri sidecar vs 외부 Python 설치 배포 방식 결정
3. 모델 크기 선택 UI (desktop 설정 화면)
4. silero-vad 도입 검토 (에너지 VAD 한계 보완)
5. PostgreSQL 영구 저장 우선순위 재검토

## 지금 주의할 점

- `cpal` 메인 캡처 엔진으로 회귀하지 않는다.
- Rust 툴체인 핀 `1.86.0`은 유지한다.
- 같은 파일군을 Codex와 Claude가 동시에 최종 수정하지 않는다.
- 확정 설계 변경은 먼저 문서에 남긴다.
- desktop `audio/worker.rs`와 OpenAI bridge의 현재 동작은 유지한 채, Step 9는 pipeline/translation 중심으로 확장한다.
- 웹 viewer는 오디오 없이 `session.join`만 보내는 구독자 역할을 유지한다.
- pipeline REST API를 쓰는 기록/상세 화면은 서비스 비가동 시 graceful fallback을 유지한다.
- 로컬 오픈소스 피벗은 "전체 구조 폐기"가 아니라 "provider layer와 배포 전략 전환"을 기본 원칙으로 본다.
