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
  - `gateway.error`

개발 명령:

- `npm run dev -w @sorisori/realtime`
- `npm run check -w @sorisori/realtime`
- `npm run test -w @sorisori/realtime`
