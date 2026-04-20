import type { SessionLifecycleStatus, TranscriptSegment } from "./session";

export interface SessionStatusChangedEvent {
  type: "session.status.changed";
  sessionId: string;
  status: SessionLifecycleStatus;
  occurredAt: string;
}

export interface TranscriptSegmentUpsertedEvent {
  type: "transcript.segment.upserted";
  sessionId: string;
  segment: TranscriptSegment;
  occurredAt: string;
}

export interface SessionErrorEvent {
  type: "session.error";
  sessionId: string;
  message: string;
  recoverable: boolean;
  occurredAt: string;
}

export type SessionEvent =
  | SessionStatusChangedEvent
  | TranscriptSegmentUpsertedEvent
  | SessionErrorEvent;
