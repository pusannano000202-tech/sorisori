import type { AudioSourceType, AudioStreamFormat } from "./audio";
import type { SessionLifecycleStatus, TranscriptSegment } from "./session";

export type RealtimeClientRole = "desktop-capture" | "web-viewer" | "pipeline";

export interface GatewayHelloMessage {
  type: "gateway.hello";
  clientId: string;
  role: RealtimeClientRole;
  occurredAt: string;
}

export interface RealtimeSessionStartMessage {
  type: "session.start";
  sessionId: string;
  sourceType: AudioSourceType;
  sourceLabel: string;
  sourceFormat: AudioStreamFormat;
  targetFormat: AudioStreamFormat;
  chunkDurationMs: number;
  targetLanguage: "ko";
  occurredAt: string;
}

export interface RealtimeAudioChunkAppendMessage {
  type: "audio.chunk.append";
  sessionId: string;
  chunkIndex: number;
  pcm16Base64: string;
  frameCount: number;
  sampleRateHz: number;
  durationMs: number;
  peakLevel: number;
  timestampMs: number;
  occurredAt: string;
}

export interface RealtimeCaptureMetricsMessage {
  type: "capture.metrics";
  sessionId: string;
  chunkIndex: number;
  inputFrames: number;
  outputFrames: number;
  peakLevel: number;
  silent: boolean;
  dataDiscontinuity: boolean;
  sourceSampleRateHz: number;
  chunkTimestampMs: number;
  occurredAt: string;
}

export interface RealtimeSessionStopMessage {
  type: "session.stop";
  sessionId: string;
  reason: string;
  occurredAt: string;
}

export interface RealtimeSessionJoinMessage {
  type: "session.join";
  sessionId: string;
  occurredAt: string;
}

export interface RealtimePingMessage {
  type: "gateway.ping";
  occurredAt: string;
}

export type RealtimeGatewayClientMessage =
  | GatewayHelloMessage
  | RealtimeSessionStartMessage
  | RealtimeSessionJoinMessage
  | RealtimeAudioChunkAppendMessage
  | RealtimeCaptureMetricsMessage
  | RealtimeSessionStopMessage
  | RealtimePingMessage;

export interface GatewayWelcomeMessage {
  type: "gateway.welcome";
  connectionId: string;
  acceptedRoles: RealtimeClientRole[];
  occurredAt: string;
}

export interface RealtimeSessionStateMessage {
  type: "session.state";
  sessionId: string;
  status: SessionLifecycleStatus;
  connectedClients: number;
  totalAudioChunks: number;
  latestChunkIndex: number | null;
  occurredAt: string;
}

export interface RealtimeAudioChunkAckMessage {
  type: "audio.chunk.ack";
  sessionId: string;
  chunkIndex: number;
  totalAudioChunks: number;
  totalAudioBytes: number;
  occurredAt: string;
}

export interface RealtimeCaptureMetricsObservedMessage {
  type: "capture.metrics.observed";
  sessionId: string;
  chunkIndex: number;
  peakLevel: number;
  silent: boolean;
  dataDiscontinuity: boolean;
  occurredAt: string;
}

export type RealtimeProviderStateStatus =
  | "connecting"
  | "ready"
  | "error"
  | "closed";

export interface RealtimeProviderStateMessage {
  type: "provider.state";
  sessionId: string;
  provider: "openai-realtime-transcription";
  status: RealtimeProviderStateStatus;
  model: string;
  message: string;
  occurredAt: string;
}

export interface RealtimeTranscriptionDeltaMessage {
  type: "transcription.delta";
  sessionId: string;
  itemId: string;
  contentIndex: number;
  delta: string;
  sequence: number | null;
  previousItemId: string | null;
  occurredAt: string;
}

export interface RealtimeTranscriptionCompletedMessage {
  type: "transcription.completed";
  sessionId: string;
  itemId: string;
  contentIndex: number;
  transcript: string;
  sequence: number | null;
  previousItemId: string | null;
  occurredAt: string;
}

export interface RealtimeTranscriptionFailedMessage {
  type: "transcription.failed";
  sessionId: string;
  itemId: string;
  contentIndex: number;
  errorMessage: string;
  sequence: number | null;
  previousItemId: string | null;
  occurredAt: string;
}

export interface GatewayPongMessage {
  type: "gateway.pong";
  occurredAt: string;
}

export interface GatewayErrorMessage {
  type: "gateway.error";
  message: string;
  recoverable: boolean;
  sessionId?: string;
  occurredAt: string;
}

export interface RealtimeSegmentUpsertedMessage {
  type: "segment.upserted";
  sessionId: string;
  segment: TranscriptSegment;
  occurredAt: string;
}

export type RealtimeGatewayServerMessage =
  | GatewayWelcomeMessage
  | RealtimeSessionStateMessage
  | RealtimeAudioChunkAckMessage
  | RealtimeCaptureMetricsObservedMessage
  | RealtimeProviderStateMessage
  | RealtimeTranscriptionDeltaMessage
  | RealtimeTranscriptionCompletedMessage
  | RealtimeTranscriptionFailedMessage
  | RealtimeSegmentUpsertedMessage
  | GatewayPongMessage
  | GatewayErrorMessage;
