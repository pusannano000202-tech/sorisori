import type { TranscriptSegment } from "@sorisori/contracts";

export interface SessionRecord {
  sessionId: string;
  segments: TranscriptSegment[];
  firstSegmentAt: string | null;
  lastSegmentAt: string | null;
  totalSegments: number;
}

export class SegmentStore {
  private readonly sessions = new Map<string, SessionRecord>();

  upsert(sessionId: string, segment: TranscriptSegment, occurredAt: string): void {
    let record = this.sessions.get(sessionId);
    if (!record) {
      record = {
        sessionId,
        segments: [],
        firstSegmentAt: occurredAt,
        lastSegmentAt: occurredAt,
        totalSegments: 0,
      };
      this.sessions.set(sessionId, record);
    }

    const existingIndex = record.segments.findIndex((s) => s.id === segment.id);
    if (existingIndex >= 0) {
      record.segments[existingIndex] = segment;
    } else {
      record.segments.push(segment);
      record.segments.sort((a, b) => a.seq - b.seq);
    }

    if (!record.firstSegmentAt) {
      record.firstSegmentAt = occurredAt;
    }
    record.lastSegmentAt = occurredAt;
    record.totalSegments = record.segments.length;
  }

  getSession(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): SessionRecord[] {
    return Array.from(this.sessions.values());
  }

  getSegments(sessionId: string): TranscriptSegment[] {
    return this.sessions.get(sessionId)?.segments ?? [];
  }

  getSummary(sessionId: string): { sourceText: string; translatedText: string; segmentCount: number } {
    const segments = this.getSegments(sessionId);
    return {
      sourceText: segments
        .map((s) => s.sourceText)
        .filter(Boolean)
        .join(" "),
      translatedText: segments
        .map((s) => s.translatedText)
        .filter(Boolean)
        .join(" "),
      segmentCount: segments.length,
    };
  }
}
