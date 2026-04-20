import type { TranscriptSegment } from "@sorisori/contracts";

export interface SessionRecord {
  sessionId: string;
  firstSegmentAt: string | null;
  lastSegmentAt: string | null;
  totalSegments: number;
}

export interface SegmentSummary {
  sourceText: string;
  translatedText: string;
  segmentCount: number;
}

export interface ISegmentStore {
  upsert(sessionId: string, segment: TranscriptSegment, occurredAt: string): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | undefined>;
  getAllSessions(): Promise<SessionRecord[]>;
  getSegments(sessionId: string): Promise<TranscriptSegment[]>;
  getSummary(sessionId: string): Promise<SegmentSummary>;
  close(): Promise<void>;
}
