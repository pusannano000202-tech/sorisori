# TRD - 실시간 외국어 음성 -> 한국어 번역 서비스 기술 설계

- 문서 버전: v0.2
- 작성일: 2026-04-29
- 상태: Active Draft
- 대상: 아키텍처, 기술 선택, 협업/복구 방식 정의

## 1. 기술 목표

다음 4가지를 동시에 만족하는 구조를 만든다.

1. 컴퓨터에서 나오는 외국어 소리를 안정적으로 수집할 것
2. 지연을 낮춘 상태로 한국어 자막을 제공할 것
3. 웹과 데스크톱 앱을 함께 운영할 것
4. Codex와 Claude Code 협업 중 세션이 끊겨도 바로 재개할 수 있을 것

## 2. 핵심 기술 판단

### 판단 A - 순수 웹만으로는 부족하다

브라우저 보안 제약 때문에 "기기 전체 시스템 오디오"를 모든 환경에서 일관되게 캡처하기는 어렵다. 따라서 제품은 다음의 2계층 전략으로 간다.

- 웹: 계정, 세션 UI, 자막 뷰어, 브라우저 탭 오디오 기반 사용 시나리오
- 데스크톱 앱: 안정적인 시스템 오디오 캡처, 장시간 세션, 운영체제 권한 처리

### 판단 B - 실시간 파이프라인은 분리형이 유리하다

오디오 수집, STT, 번역, 저장을 분리하면 공급자 교체, 비용 최적화, 디버깅이 쉬워진다.

### 판단 C - 공급자 종속은 인터페이스로 흡수한다

초기에는 빠른 MVP를 위해 관리형 STT/번역 API를 고려하되, 코드 구조는 공급자 교체가 가능해야 한다.

### 판단 D - Windows 오디오 캡처는 WASAPI loopback 직결이 맞다

Windows MVP에서는 가상 오디오 케이블 설치를 강제하지 않는다. Tauri의 Rust 계층에서 WASAPI loopback을 직접 사용해 시스템 출력 오디오를 캡처한다.

## 3. 권장 시스템 아키텍처

```text
[Web App] -------------------\
                              -> [Realtime Gateway] -> [STT Provider Adapter]
[Desktop App] --------------/                         -> [Translation Adapter]
                                                         -> [Session Store]
                                                         -> [Metrics/Logs]
```

### 구성 요소

#### Web App

- 역할: 로그인, 세션 시작 UI, 실시간 자막 표시, 세션 기록 조회
- 기술 후보: Next.js + TypeScript

#### Desktop App

- 역할: 시스템 오디오 캡처, 장시간 세션 안정화, 권한 처리
- 기술 후보: Tauri + Rust + WebView 프런트
- 선택 이유: Electron보다 가볍고, OS 오디오 브리지 구현에 유리하며 웹 UI 재사용이 쉽다.
- Rust 기준 툴체인: `1.86.0` 이상을 프로젝트 로컬에서 고정한다.
- Windows MVP 구현: `wasapi` Rust crate 기반 loopback 캡처를 우선 채택
- `cpal` 위치: 공통 오디오 추상화나 향후 마이크/크로스플랫폼 입력에는 후보가 될 수 있지만, MVP의 Windows 시스템 오디오 캡처 엔진은 아니다.
- 포맷 변환 계층: 캡처 직후 `float32/stereo/44.1kHz or 48kHz` 계열 입력을 `PCM16/mono/24kHz`로 변환하는 전용 레이어를 둔다.

#### Realtime Gateway

- 역할: 클라이언트와 서버 간 양방향 스트리밍
- 프로토콜: WebSocket 우선
- 책임: 세션 인증, 오디오 프레임 수신, 번역 결과 브로드캐스트, 연결 재시도
- 현재 구현 기준 엔드포인트: `GET /health`, `WS /ws`
- 초기 uplink 메시지: `gateway.hello`, `session.start`, `audio.chunk.append`, `capture.metrics`, `session.stop`
- 초기 응답 메시지: `gateway.welcome`, `session.state`, `audio.chunk.ack`, `capture.metrics.observed`, `gateway.error`

#### STT Pipeline

- 역할: 음성 인식, 언어 감지, 문장 경계 추정
- 형태: 스트리밍 또는 짧은 청크 기반 처리

#### Translation Pipeline

- 역할: 인식 결과를 자연스러운 한국어로 변환
- 전략: 짧은 구간 누적 후 번역, 문맥 보정, 용어집 확장 가능 구조

#### Session Store

- 역할: 세션 메타데이터, 원문/번역 세그먼트, 오류 로그 저장

#### Metrics and Logs

- 역할: 지연, 실패율, 비용, 재연결 횟수, 공급자 오류 모니터링

## 4. 제안 기술 스택

### 프런트엔드

- `Next.js`
- `TypeScript`
- `Tailwind CSS`
- 실시간 연결: `WebSocket`

### 데스크톱

- `Tauri`
- `Rust`
- 필요 시 OS별 오디오 캡처 모듈

### 백엔드

- `FastAPI` 또는 `Python` 기반 비동기 서버
- 이유: 음성/STT 생태계와 연결이 수월하고 실험 속도가 빠르다.

### 데이터 저장소

- 메타데이터: `PostgreSQL`
- 세션 캐시/버퍼: `Redis`
- 원문/번역 로그: PostgreSQL 또는 객체 저장소 병행

### 공통 패키지

- API 스키마 계약
- 세션 이벤트 타입
- 자막 세그먼트 타입
- 공급자 인터페이스 추상화

### 오디오 변환 유틸리티

- 리샘플링: `rubato`
- 채널 다운믹스 및 샘플 포맷 변환: `dasp`
- 책임: WASAPI loopback이 내보내는 엔드포인트 종속 포맷을 OpenAI Realtime API 입력 포맷으로 정규화

## 4.1 MVP 공급자 결정

### 기본안

- 실시간 STT: OpenAI `gpt-4o-mini-transcribe` 기본, 필요 시 `gpt-4o-transcribe` 품질 모드
- 한국어 번역: DeepL `translate` API

### 이유

- OpenAI 공식 문서는 진행 중인 오디오의 스트리밍 전사를 Realtime API로 지원한다.
- OpenAI 공식 문서는 `whisper-1`에서 streamed transcription이 지원되지 않는다고 명시한다.
- OpenAI 공식 문서의 audio `translations` 엔드포인트는 영어 번역만 지원하므로, 한국어 타깃 제품에는 별도 번역기가 필요하다.
- DeepL 텍스트 번역 API는 안정적이고 한국어 품질 기대치가 높다.

### 구현 메모

- 제품 표기는 "Whisper + DeepL"보다 "OpenAI realtime transcription + DeepL translation"이 정확하다.
- 저장 세그먼트는 `source_text`와 `translated_text`를 분리 저장한다.
- 공급자 교체를 위해 `TranscriptionProvider`, `TranslationProvider` 인터페이스를 둔다.

### 대안 후보

- DeepL Voice API: 실시간 음성 전사/번역을 WebSocket으로 제공하므로 스파이크 검증 가치가 있다. 다만 공식 SDK 통합이 아직 없고, 일부 언어는 외부 파트너 전사에 의존한다.
- Azure Speech Translation: STT+번역 통합 경로로 매력적이지만 초기 MVP에서는 품질 튜닝과 공급자 독립성 면에서 후순위다.
- Google Speech-to-Text + Cloud Translation: 운영 단순성과 범용성은 좋지만, 초기 판단 기준은 한국어 결과 품질 우선이다.

## 5. 실시간 처리 흐름

### 세션 시작

1. 사용자가 입력 소스를 선택한다.
2. 클라이언트가 세션을 생성한다.
3. WebSocket 연결을 맺고 오디오 스트리밍을 시작한다.

### 오디오 전처리

1. 입력 오디오를 PCM 또는 공급자 요구 형식으로 정규화한다.
2. 샘플레이트를 통일한다.
3. 무음 구간 감지 또는 짧은 청크 분할을 수행한다.
4. 권장 청크는 50~250ms 범위에서 시작하고, 실제 지연/품질 측정으로 조정한다.

### 캡처 후 포맷 변환 단계

Windows 렌더링 엔드포인트의 loopback 출력은 장치 설정에 따라 달라질 수 있다. 일반적으로 `float32`, `44.1kHz` 또는 `48kHz`, `stereo` 포맷이 흔하다. 반면 OpenAI Realtime API 전사 세션은 `PCM16`, `24kHz`, `mono` 기준으로 맞추는 것이 구현상 가장 단순하다.

따라서 Desktop App의 오디오 파이프라인에는 아래 변환이 명시적으로 들어간다.

1. WASAPI loopback 캡처
2. 채널 다운믹스: `stereo -> mono`
3. 비트 깊이 변환: `float32 -> PCM16`
4. 리샘플링: `44.1/48kHz -> 24kHz`
5. 50~250ms 청크 분할
6. Realtime Gateway 또는 공급자 WebSocket으로 전송

이 단계는 캡처 모듈 내부 또는 캡처 모듈 바로 뒤의 `audio-format-adapter` 계층으로 구현한다.

### Desktop worker/session 상태 모델

Desktop App의 Step 6 기준 캡처 구조는 아래처럼 나눈다.

1. `start_capture_session` 커맨드가 세션 시작 요청을 받는다.
2. Tauri 전역 상태는 `Mutex<Option<CaptureSession>>`으로 현재 실행 중인 세션을 하나만 보관한다.
3. 실제 `WASAPI` COM 객체(`AudioClient`, `AudioCaptureClient`, event handle)는 worker 스레드 내부에서 생성하고 그 스레드가 끝날 때까지 소유한다.
4. worker 스레드는 고정 `20ms` 청크 단위로 `downmix -> resample -> PCM16` 변환을 수행한다.
5. worker는 `capture-metrics`와 `audio-chunk` 이벤트를 채널로 Tauri bridge에 넘기고, bridge가 프런트엔드로 emit한다.
6. uplink 연결 전에는 `capture-metrics`로 peak level, silent flag, discontinuity flag, timestamp를 먼저 검증한다.

이 구조를 기준으로 다음 단계에서 `audio-chunk`를 realtime gateway 업링크에 연결한다.

### Realtime gateway uplink 형태

Step 7 기준 Desktop App은 Tauri 이벤트 브리지에서 `audio-chunk`를 `PCM16 little-endian base64` 문자열로 변환 없이 그대로 `services/realtime`의 `WS /ws`에 보낸다. `capture-metrics`는 별도 메시지로 같이 보내서 uplink 전 품질을 검증한다.

이 단계의 목적은 아직 OpenAI 공급자 연결이 아니라, `desktop -> gateway` 전송 경로와 세션 상태 메시지의 안정화를 먼저 확보하는 것이다.

### OpenAI realtime transcription 연결

Step 8 기준 `services/realtime`는 세션 시작 시 OpenAI Realtime transcription upstream에 별도 WebSocket 연결을 연다. 입력 오디오는 `input_audio_buffer.append` 이벤트로 전달하고, 서버 VAD가 turn commit을 자동 처리하도록 둔다.

초기 연결 파라미터는 다음 기준을 따른다.

1. WebSocket URL: `wss://api.openai.com/v1/realtime`
2. 인증: 서버 측 `OPENAI_API_KEY`
3. 기본 모델: `gpt-4o-mini-transcribe`
4. 입력 포맷: `PCM16 / 24kHz / mono`
5. turn detection: `server_vad`

gateway는 OpenAI upstream에서 받은 `conversation.item.input_audio_transcription.delta`와 `conversation.item.input_audio_transcription.completed` 이벤트를 내부 세션 ID와 함께 다시 브로드캐스트한다. 이 단계에서는 아직 번역을 붙이지 않고, transcript 품질과 ordering을 먼저 검증한다.

### 음성 인식

1. 언어를 자동 감지한다.
2. 부분 인식 결과와 확정 결과를 구분한다.
3. 확정 결과를 번역 파이프라인으로 넘긴다.

### 번역

1. 짧은 문맥 단위로 한국어 번역을 생성한다.
2. 과도한 직역을 줄이기 위해 최소 문맥을 유지한다.
3. 결과를 자막 세그먼트로 저장하고 화면에 푸시한다.

### Transcript segment assembly 및 번역 단계 (Step 9 기준)

Step 9 기준 세그먼트 조립과 번역은 `services/realtime` 내부에서 처리한다.

**조립 규칙:**

- `transcription.delta` 이벤트가 처음 도착하면 item 단위로 시작 시각(ms)을 기록한다.
- `transcription.completed` 이벤트가 도착하면 하나의 확정 세그먼트를 만든다.
- `startMs` = 해당 itemId의 첫 delta 수신 시각 - 세션 시작 시각
- `endMs` = completed 수신 시각 - 세션 시작 시각
- `seq` = OpenAI `input_audio_buffer.committed` 이벤트에서 추적하는 서버 측 시퀀스 번호
- `confidence` = 1.0 (OpenAI realtime 전사 API는 신뢰도 값을 반환하지 않음)

**번역 단계:**

- `DEEPL_API_KEY` 환경 변수가 설정된 경우에만 DeepL 번역을 호출한다.
- `transcription.completed` 수신 후 비동기로 DeepL text API를 호출한다 (기본 타임아웃 5초).
- 번역 성공 시 `translatedText`에 결과를 채운다. 실패 또는 타임아웃 시 빈 문자열로 세그먼트를 발행한다.
- DeepL free tier key는 `:fx` 접미사로 식별해 `api-free.deepl.com`을 사용한다.

**브로드캐스트:**

- 세그먼트가 완성되면 `segment.upserted` 메시지를 세션의 모든 연결 클라이언트에 브로드캐스트한다.
- `transcription.completed`와 `segment.upserted`는 별도 이벤트로 유지한다. 전자는 원문 전사, 후자는 번역 포함 최종 세그먼트다.

**향후 분리 경계:**

- `services/realtime`은 전송 게이트웨이 + 세그먼트 조립까지만 담당한다.
- 세그먼트 저장, 요약, 후처리는 `services/pipeline`으로 이전할 수 있다.

### 저장 및 종료

1. 세션 메타데이터와 자막 세그먼트를 저장한다.
2. 세션 종료 시 요약/내보내기 가능 상태로 만든다.

## 6. 데이터 모델 초안

### Session

- `id`
- `user_id`
- `source_type`
- `source_label`
- `input_language`
- `target_language`
- `status`
- `started_at`
- `ended_at`

### TranscriptSegment

- `id`
- `session_id`
- `seq`
- `start_ms`
- `end_ms`
- `source_text`
- `translated_text`
- `confidence`
- `is_final`

### Checkpoint

- `id`
- `topic`
- `branch_name`
- `files_changed`
- `decisions`
- `next_step`
- `commands_run`
- `created_at`

## 7. 저장소 구조 제안

```text
docs/
  PRD.md
  TRD.md
  DECISIONS/

.ops/
  task-log.md
  handoff-template.md
  checkpoints/

apps/
  web/
  desktop/

services/
  realtime/
  pipeline/

packages/
  contracts/
  ui/
  config/
```

## 8. 개발 운영 방식 - Codex + Claude Code

### 원칙

- 기준 문서는 저장소에 남는다. 채팅 기록은 참고용이다.
- 한 작업 단위는 최대한 작게 쪼개고, 끝날 때마다 체크포인트를 남긴다.
- 같은 파일을 두 AI가 동시에 최종 수정하지 않는다.
- 설계 변경은 코드보다 먼저 문서에 반영한다.

### 역할 분담 예시

#### Codex에 적합한 작업

- 실제 파일 생성/수정
- 코드 패치와 리팩터링
- 테스트 실행과 수정
- 저장소 구조 정리

#### Claude Code에 적합한 작업

- 구조 리뷰
- 기술 대안 비교
- 긴 문서 정리
- 복잡한 프롬프트/명세 초안

### 협업 프로토콜

1. 작업 시작 전 `.ops/task-log.md`에 현재 작업을 기록한다.
2. 수정 대상 파일군을 정한다.
3. 작업 중 설계가 바뀌면 `docs/TRD.md` 또는 `docs/DECISIONS/`에 먼저 반영한다.
4. 작업 종료 전 체크포인트를 남긴다.
5. 다른 AI에게 넘길 때는 핸드오프 문서를 남긴다.
6. Claude와 Codex가 같은 저장소를 기준으로 협업할 때는 `.ops/ai-bridge/requests/`와 `.ops/ai-bridge/responses/`를 사용한다.

## 9. 토큰 소진 대응 전략

### 언제 저장할 것인가

- 기능 하나가 끝났을 때
- 리팩터링 직전
- 여러 파일을 건드린 직후
- 테스트 결과를 얻은 직후
- 토큰이 20~30% 이하로 보일 때
- 세션 종료 또는 모델 전환 직전

### 무엇을 저장할 것인가

- 현재 브랜치명
- 바뀐 파일 목록
- 왜 바꿨는지
- 아직 안 끝난 부분
- 다음 세션 첫 할 일
- 실행 명령과 결과
- 실패 원인과 가설

### 어디에 저장할 것인가

#### 1차 저장

- 코드/문서 파일 자체

#### 2차 저장

- `.ops/checkpoints/YYYY-MM-DD-HHMM-topic.md`

#### 3차 저장

- 가능하면 Git 커밋
- 커밋 메시지 예: `WIP: wire realtime session state`

### 체크포인트 템플릿

```md
# Checkpoint

- Date:
- Branch:
- Topic:
- Files changed:
- Decisions made:
- Commands run:
- Validation result:
- Remaining work:
- Next immediate step:
- Resume prompt:
```

### 이어받기 프롬프트 규칙

체크포인트마다 아래 항목을 남긴다.

- 현재 목표 한 줄
- 읽어야 할 문서/파일
- 수정할 파일
- 금지해야 할 것
- 다음 실행 명령 1~2개

## 10. 작업 중단 복구 시나리오

### 시나리오 A - 토큰 부족으로 대화 종료

1. 마지막으로 바꾼 파일 저장
2. `.ops/checkpoints/`에 체크포인트 기록
3. 가능하면 WIP 커밋
4. 다음 AI에게 체크포인트 파일과 함께 이어받기

### 시나리오 B - Codex에서 Claude Code로 전환

1. `.ops/task-log.md` 갱신
2. 설계 변경 여부 확인
3. 체크포인트와 관련 파일 경로 전달
4. Claude Code는 먼저 문서와 변경 파일을 읽고 시작

### 시나리오 C - Claude Code에서 Codex로 전환

1. Claude Code가 결정/리스크를 문서화
2. Codex는 문서 기준으로 파일 수정
3. 구현 후 검증 결과를 다시 체크포인트에 남김

## 11. 브랜치 및 커밋 전략

### 브랜치

- `main`: 안정 기준선
- `feat/*`: 기능 개발
- `spike/*`: 짧은 실험
- `docs/*`: 문서 작업

### 커밋

- 작은 단위로 자주 남긴다.
- 깨진 상태의 대형 변경을 오래 쌓아두지 않는다.
- 문서와 코드가 함께 바뀌면 한 작업 단위로 묶는다.

## 12. 초기 구현 순서 제안

### Step 1

- 모노레포 구조 생성
- 공통 문서와 운영 폴더 생성

### Step 2

- 웹 앱 기본 UI
- 세션 생성 화면
- 실시간 자막 레이아웃

### Step 3

- 데스크톱 앱에서 시스템 오디오 캡처 실험
- WebSocket 업링크 연결

### Step 4

- STT 공급자 연결
- 번역 공급자 연결
- 자막 세그먼트 표시

### Step 5

- 세션 저장
- 재연결 처리
- 실패 로그/메트릭 수집

## 13. 열린 결정 사항

- 데스크톱 앱 UI를 웹과 100% 공유할지
- 인증을 MVP에 포함할지
- 세션 기록 보존 기간을 어떻게 가져갈지
- DeepL Voice API를 Phase 1 스파이크 후보로 넣을지

## 14. 현 시점 추천 결론

- 제품 형태는 "웹 + 데스크톱 앱" 이중 전략으로 간다.
- MVP는 Windows 중심으로 시작한다.
- 기술 구조는 `오디오 캡처 -> 실시간 게이트웨이 -> STT -> 번역 -> 자막/저장` 파이프라인으로 단순화한다.
- Windows 시스템 오디오 캡처는 Tauri의 Rust 계층에서 WASAPI loopback으로 직접 처리한다.
- 현재 품질개선 페이즈 기본안은 `로컬 STT(local-ai) + 로컬 번역 + 선택적 로컬 LLM 보정`이며, 관리형 API는 비교 벤치마크/대안 경로로 유지한다.
- 협업은 문서 우선, 체크포인트 강제, 작은 작업 단위 원칙으로 운영한다.
- 토큰 소진은 예외 상황이 아니라 기본 전제로 보고, 체크포인트와 WIP 커밋을 운영 표준으로 삼는다.

## 15. STT 평가 데이터셋 설계 (EN/JA 200)

### 목표 구성

언어별 100개, 총 200개 샘플을 고정 테스트셋으로 운영한다.

1. 합성음 30개
2. 사람 음성 40개 (외부 공개 코퍼스 + 실사용 발화)
3. 음악 섞인 음성 30개 (클립당 약 5초, Pop/J-POP 가사 구간)

### 저장 원칙

1. 저장소에는 기본적으로 `manifest/정답/메타데이터`를 커밋한다.
2. 저작권 이슈가 있는 원본 오디오는 기본 커밋 대상에서 제외한다.
3. 외부 소스는 `source_url`, `license`, `collected_at`, `hash`를 manifest에 남긴다.

### 데이터 단위 스키마

`stt_corpus.json`의 case는 아래를 최소 포함한다.

1. `id`
2. `lang` (`en`/`ja`)
3. `audio_path`
4. `expected_text`
5. `keywords`
6. `source_type` (`synthetic`/`human_external`/`music_mixed`)
7. `license_note` (필요 시)

## 16. 실행 전략 (나사 조정 + 부품 교체 분기)

### 1차: 기존 부품 정밀 튜닝

Whisper 디코딩/버퍼링 파라미터를 반복 실험한다.

현재 기준:

1. `WHISPER_MODEL`: `small`
2. `beam_size` 확장
3. 짧은 조각 드랍 완화
4. `/health`에서 STT 파라미터 노출

### 2차: 성능 게이트 체크

고정 EN/JA 음성셋으로 점수를 산출한다.

1. EN 키워드 보존율 85% 미만 -> 게이트 실패
2. JA 키워드 보존율 75% 미만 -> 게이트 실패

하나라도 실패하면 즉시 3차 단계로 전환한다.

### 3차: 새 부품 교체 실험

후보 A:

1. Whisper `medium` 또는 `large-v3` 드롭인 교체

후보 B:

1. 일본어 특화 STT 엔진 스파이크 (별도 라우트)

비교 축:

1. 정확도(키워드 보존율, 누락률)
2. 지연(ms)
3. 메모리/CPU 점유
4. 배포 난이도

## 17. 자동화 파이프라인 (수집 -> 평가 -> 앱 반영)

### A. 데이터 수집 자동화

1. 합성음 생성
   - 입력: 문장 목록
   - 출력: 오디오 파일 + manifest 행
2. 외부 사람 음성 수집
   - 입력: 허용 코퍼스 목록 + 샘플 수
   - 출력: 다운로드/선별/클립 추출
3. 음악 섞인 샘플 수집
   - 입력: 사용자 로컬 파일/링크 메타
   - 출력: 5초 클립 + 정답 텍스트

### B. 정제 자동화

1. 포맷 통일: mono/24kHz/PCM16
2. 길이 검증: 목표 5초(허용 오차 범위 설정)
3. 텍스트 정규화: 공백/기호/유니코드 정규화
4. 중복 제거: 오디오 해시 + 문장 유사도

### C. 평가 자동화

1. 분리 평가
   - `audio -> /transcribe`
   - `text -> /translate`
2. 통합 평가
   - `audio -> ko subtitle`
3. 리포트 산출
   - 언어별 키워드 보존율
   - 누락/치환/환청 카운트
   - 지연 통계
   - 빌드/커밋별 추이

### D. 앱 레벨 검증 자동화

1. Desktop sidecar 기동
2. Realtime gateway 연결
3. 샘플 오디오 주입
4. 최종 자막 로그 수집
5. 기준 미달 시 파이프라인 단계(1차/3차) 자동 표시

## 18. 평가 기준 및 자동 전환 규칙

### 핵심 KPI

1. EN 키워드 보존율 >= 85%
2. JA 키워드 보존율 >= 75%

### 자동 전환 조건

아래 중 하나면 3차(부품교체) 모드로 진입한다.

1. EN < 85
2. JA < 75

### 전환 시 즉시 수행

1. 기존 실험값 스냅샷 저장
2. 부품교체 후보 A/B 실험 브랜치 생성
3. 동일 테스트셋으로 A/B 재측정
4. 성능/지연/운영비 비교 후 1개 채택

## 19. 구현 산출물 로드맵 (이번 품질개선 트랙)

1. `services/local-ai/eval/stt_corpus.json` 200케이스 확장
2. 데이터 수집/정제 스크립트 세트 추가
3. 분리+통합 평가 리포트 JSON/Markdown 자동 생성
4. 앱 실행 평가 커맨드 1회 실행으로 전체 검증
5. 게이트 실패 시 부품교체 실험 자동 안내
