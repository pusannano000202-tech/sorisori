# Shared Context

- 프로젝트: 컴퓨터/노트북 등에서 재생되는 외국어 오디오를 실시간 한국어 자막으로 보여주는 웹 + 데스크톱 앱
- 현재 날짜 기준 문맥: 2026-05-01
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

## 현재 기술 기준 (2026-04-28 기준 최신)

- Windows MVP 오디오 캡처: `wasapi` (WASAPI loopback)
- 포맷 변환: `rubato + dasp` (PCM16 / mono / 24kHz)
- 실시간 전사: faster-whisper (`services/local-ai`, port 8789) — **WHISPER_MODEL=medium**, beam_size=10, Silero VAD 활성
  - (2026-04-30 step39: small → medium 업그레이드, 한자 숫자 정규화, prompt-echo 필터 추가)
- 번역: **Ollama LLM 우선** (env로 활성화) + Argos/NLLB fallback + MarianMT 보조
  - LLM 활성: `LOCAL_AI_LLM_BACKEND=ollama`, `LOCAL_AI_LLM_MODEL=qwen2.5:7b-instruct-q4_K_M`
  - LLM은 en→ko, ja→ko 모두 첫 시도. 빈 응답/한글 없음/타임아웃 7s 시 자동 fallback
  - 영어: `Argos en→ko` direct가 LLM 다음 fallback
  - 일본어: `NLLB direct ja→ko`가 LLM 다음 fallback (`LOCAL_AI_JA_TRANSLATION_MODE=auto`)
  - direct 실패 시 `ja→en→ko` bridge fallback
  - MarianMT `Helsinki-NLP/opus-mt-tc-big-en-ko`는 en→ko 최후 fallback
  - 측정 결과 (2026-04-28 step28): 전체 chrF 30.70 → 51.22 (+20.52, 67% 개선),
    지연 평균 626ms → 1506ms. eval baseline은 `services/local-ai/eval/`
- 사이드카 3개 (Tauri 자동 기동):
  - `sorisori-local-ai` (PyInstaller, port 8789) — faster-whisper STT + NLLB/Argos/Marian 번역
  - `sorisori-realtime` (pkg node18, port 8787) — WebSocket gateway
  - `sorisori-pipeline` (pkg node18, port 8788) — segment REST store
- 배포: NSIS 인스톨러 (~150MB), `apps/desktop/src-tauri/target/release/bundle/nsis/`
- GitHub: 아직 remote 미설정 — 사용자가 레포 생성 후 push 필요

## 현재 다음 우선순위

1. **(완료) STT 품질 게이트 PASS — step43**
   - step44 (2026-05-02): 지연 개선 + PyInstaller DLL 수정 + 타이밍 로그 추가
   - **게이트 결과: EN 90.30 (≥85) ✅ / JA 86.36 (≥75) ✅**
   - 세부: EN 90.30 / JA human_external 87.91 / JA music_mixed 84.00
   - 누적 개선: JA music_mixed 57.6 → 69.49 → 79.66 → **84.00**
   - 체크포인트: `.ops/checkpoints/2026-05-01-step43-ja-audio-preprocess.md`
   - 처리된 handoff: step40/41/42/43

2. **(다음 작업) 라이브 캡처 30분 검증**
   - 유튜브 회화/음악혼합 30분 재생 → 자막 품질 육안 확인
   - Codex step40 권장 사항

3. **(선택) JA music_mixed 추가 개선 (현재 69.49 → 목표 85)**
   - **경로 A**: JA 전용 large-v3 라우트 (`WHISPER_MODEL_JA=large-v3`, main.py 분기)
   - **경로 B**: 노이즈 제거 전처리 (music_mixed 경로 한정, 글로벌 아님)
   - 현재 게이트 목표(≥75) 는 통과 상태이므로 우선순위 낮음

4. **(보류) worst-case 회귀셋 분리 — 최악 케이스 20개 추출**
5. GitHub remote 설정 및 push (사용자가 레포 URL 제공 필요)
6. pipeline CJS 엔트리 가드 반영 새 NSIS 설치본 실행 검증

## 지금 주의할 점

- `cpal` 메인 캡처 엔진으로 회귀하지 않는다.
- Rust 툴체인 핀 `1.86.0`은 유지한다.
- 같은 파일군을 Codex와 Claude가 동시에 최종 수정하지 않는다.
- 확정 설계 변경은 먼저 문서에 남긴다.
- 유료 API(OpenAI, DeepL) 사용 금지 — 완전 로컬/무료 스택 유지.
- sidecar-bin/은 .gitignore에 추가됨 — git에 없으므로 clone 후 반드시 재빌드 필요.
- 로컬 오픈소스 피벗은 "전체 구조 폐기"가 아니라 "provider layer 교체"를 원칙으로 한다.
- 일본어는 이제 direct 경로를 우선 사용하므로, 품질 검증과 패키징 안정화가 다음 핵심이다.
- `services/local-ai/local-ai.spec`는 2026-04-28에 단순 onefile spec으로 교체되었고, sidecar 단독 `/health` 검증은 통과했다.
- `services/pipeline/src/server.ts`는 2026-04-28에 CJS/ESM 겸용 엔트리 가드로 수정되었고, pipeline sidecar 단독 `/health` 검증은 통과했다.
- `services/local-ai/main.py`는 2026-04-28 Step 27에서 언어 고정 힌트(strict/soft), 일본어 direct 우선 경로 보강, 한글 혼입 드롭, short-fragment 완화가 반영되었다.
- `services/realtime/src/local-transcription-bridge.ts`는 같은 Step 27에서 flush 타이밍을 완화해 문장 조각/누락을 줄이도록 튜닝되었다.
- 노트북 재개용 종합 handoff는 `.ops/handoff-2026-04-23-codex-to-laptop-github-resume.md`에 있다.
- 운영 규칙: 토큰 사용량이 **5시간 윈도우 기준 90%** 이상이면 구현 중단하고 즉시 handoff/checkpoint 작성으로 전환한다 (2026-04-28 사용자 지시로 93% → 90%).
