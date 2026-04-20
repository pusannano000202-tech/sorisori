# 0002 - MVP 전사/번역 스택

- 상태: Accepted
- 날짜: 2026-04-19

## 배경

MVP는 "외국어 PC 오디오 -> 한국어 자막"을 빠르게 검증해야 한다. 실시간성, 한국어 결과 품질, 구현 속도, 공급자 교체 가능성이 모두 중요하다.

## 결정

MVP 기본 스택은 아래처럼 간다.

- 실시간 전사: OpenAI `gpt-4o-mini-transcribe`
- 품질 상향 옵션: OpenAI `gpt-4o-transcribe`
- 한국어 번역: DeepL Text Translation API

## 이유

- OpenAI 공식 문서는 Realtime API를 통해 진행 중인 오디오의 스트리밍 전사를 지원한다.
- OpenAI 공식 문서는 `whisper-1`에서 streamed transcription이 지원되지 않는다고 명시한다.
- OpenAI 공식 문서는 audio `translations` 엔드포인트가 영어 번역만 제공한다고 설명한다. 따라서 한국어 타깃 서비스에는 별도 번역 계층이 필요하다.
- DeepL 텍스트 번역 API는 범용 텍스트 번역용으로 안정적인 인터페이스를 제공한다.

## 대안

### Azure Speech Translation

- 장점: 실시간 speech-to-text translation 통합 경로를 제공한다.
- 단점: MVP 시점에는 통합 공급자 종속이 커지고, STT와 번역을 개별 교체하기 어렵다.

### Google Speech-to-Text + Cloud Translation

- 장점: 범용성과 운영 친화성이 높다.
- 단점: 초기 기준인 한국어 번역 자연스러움 관점에서는 우선순위를 낮춘다.

### DeepL Voice API

- 장점: WebSocket 기반 실시간 음성 전사/번역을 한 번에 제공한다.
- 단점: 공식 DeepL SDK에 아직 통합되어 있지 않고, 일부 언어는 외부 파트너 전사에 의존한다.
- 처리: 초기 MVP 기본안은 아니지만 Phase 1 스파이크 후보로 보관한다.

## 영향

- 서버는 `TranscriptionProvider`와 `TranslationProvider`를 분리한다.
- `whisper-1`은 핵심 실시간 경로가 아니라 배치 재처리나 비교 실험용 후보로만 남긴다.
- 공급자 비교 벤치마크는 이후 실측 지연/품질/비용 기준으로 수행한다.
