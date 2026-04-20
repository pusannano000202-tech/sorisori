# Realtime Service

책임:

- 세션 연결 관리
- 오디오 청크 수신
- 전사/번역 결과 실시간 전달
- 재연결과 세션 상태 관리

현재 구현:

- `GET /health`: in-memory 세션/연결 상태 확인
- `WS /ws`: desktop uplink용 WebSocket 엔드포인트
- 수신 메시지:
  - `gateway.hello`
  - `session.start`
  - `audio.chunk.append`
  - `capture.metrics`
  - `session.stop`
- 송신 메시지:
  - `gateway.welcome`
  - `session.state`
  - `audio.chunk.ack`
  - `capture.metrics.observed`
  - `provider.state`
  - `transcription.delta`
  - `transcription.completed`
  - `transcription.failed`
  - `gateway.error`

OpenAI transcription:

- 환경 변수:
  - `OPENAI_API_KEY`
  - `OPENAI_REALTIME_TRANSCRIBE_MODEL` 기본값: `gpt-4o-mini-transcribe`
  - `OPENAI_REALTIME_BASE_URL` 기본값: `wss://api.openai.com/v1/realtime`
  - `OPENAI_REALTIME_LANGUAGE` 선택
  - `OPENAI_REALTIME_TRANSCRIPTION_PROMPT` 선택
- 동작:
  - 세션 시작 시 OpenAI Realtime transcription upstream WebSocket 연결
  - 오디오 청크는 `input_audio_buffer.append`
  - transcript 이벤트는 gateway 이벤트로 재방출
- 테스트:
  - 실 API 없이 mock upstream WebSocket으로 통합 테스트 가능

참고 공식 문서:

- Realtime transcription guide: `https://developers.openai.com/api/docs/guides/realtime-transcription`
- Realtime WebSocket guide: `https://developers.openai.com/api/docs/guides/realtime-websocket`
- Realtime API reference: `https://developers.openai.com/api/reference/resources/realtime`

개발 명령:

- `npm run dev -w @sorisori/realtime`
- `npm run check -w @sorisori/realtime`
- `npm run test -w @sorisori/realtime`
