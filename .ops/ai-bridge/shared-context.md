# Shared Context

- 프로젝트: 컴퓨터/노트북 등에서 재생되는 외국어 오디오를 실시간 한국어 자막으로 보여주는 웹 + 데스크톱 앱
- 현재 날짜 기준 문맥: 2026-04-23
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

## 현재 기술 기준 (2026-04-23 기준 최신)

- Windows MVP 오디오 캡처: `wasapi` (WASAPI loopback)
- 포맷 변환: `rubato + dasp` (PCM16 / mono / 24kHz)
- 실시간 전사: faster-whisper (`services/local-ai`, port 8789) — beam_size=5, Silero VAD 활성
- 번역: Argos Translate 우선 + MarianMT 보조 fallback
  - 영어: `Argos en→ko` direct가 기본 경로
  - 일본어: `NLLB direct ja→ko`가 기본 경로 (`LOCAL_AI_JA_TRANSLATION_MODE=auto`)
  - direct 실패 시 `ja→en→ko` bridge fallback
  - MarianMT `Helsinki-NLP/opus-mt-tc-big-en-ko`는 en→ko fallback으로만 유지
  - 장문 영어에서는 MarianMT가 깨진 출력을 보여 Argos-first로 복구됨
- 사이드카 3개 (Tauri 자동 기동):
  - `sorisori-local-ai` (PyInstaller, port 8789) — faster-whisper STT + NLLB/Argos/Marian 번역
  - `sorisori-realtime` (pkg node18, port 8787) — WebSocket gateway
  - `sorisori-pipeline` (pkg node18, port 8788) — segment REST store
- 배포: NSIS 인스톨러 (~150MB), `apps/desktop/src-tauri/target/release/bundle/nsis/`
- GitHub: 아직 remote 미설정 — 사용자가 레포 생성 후 push 필요

## 현재 다음 우선순위

1. packaged installer/runtime 디버깅
2. GitHub remote 설정 및 push (사용자가 레포 URL 제공 필요)
3. 개인 노트북 개발환경 세팅 (Node.js 24, Python 3.11, Rust 1.86.0, sidecar 재빌드)
4. 일본어 direct 품질 검증용 소규모 코퍼스/스모크 평가 추가
5. 모델 크기 선택 UI (desktop 설정 화면)

## 지금 주의할 점

- `cpal` 메인 캡처 엔진으로 회귀하지 않는다.
- Rust 툴체인 핀 `1.86.0`은 유지한다.
- 같은 파일군을 Codex와 Claude가 동시에 최종 수정하지 않는다.
- 확정 설계 변경은 먼저 문서에 남긴다.
- 유료 API(OpenAI, DeepL) 사용 금지 — 완전 로컬/무료 스택 유지.
- sidecar-bin/은 .gitignore에 추가됨 — git에 없으므로 clone 후 반드시 재빌드 필요.
- 로컬 오픈소스 피벗은 "전체 구조 폐기"가 아니라 "provider layer 교체"를 원칙으로 한다.
- 일본어는 이제 direct 경로를 우선 사용하므로, 품질 검증과 패키징 안정화가 다음 핵심이다.
- 최신 NSIS 설치파일은 다시 빌드되었지만, 사용자 보고상 "전혀 안됨" 상태라 설치본 기준 디버깅이 우선이다.
- 노트북 재개용 종합 handoff는 `.ops/handoff-2026-04-23-codex-to-laptop-github-resume.md`에 있다.
