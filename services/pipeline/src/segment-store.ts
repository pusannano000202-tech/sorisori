import type { TranscriptSegment } from "@sorisori/contracts";
import type { ISegmentStore, SessionRecord, SegmentSummary } from "./store-interface.js";

interface InMemorySessionRecord extends SessionRecord {
  segments: TranscriptSegment[];
}

export class SegmentStore implements ISegmentStore {
  private readonly sessions = new Map<string, InMemorySessionRecord>();

  async upsert(sessionId: string, segment: TranscriptSegment, occurredAt: string): Promise<void> {
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

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    const record = this.sessions.get(sessionId);
    if (!record) return undefined;
    return {
      sessionId: record.sessionId,
      firstSegmentAt: record.firstSegmentAt,
      lastSegmentAt: record.lastSegmentAt,
      totalSegments: record.totalSegments,
    };
  }

  async getAllSessions(): Promise<SessionRecord[]> {
    return Array.from(this.sessions.values()).map((r) => ({
      sessionId: r.sessionId,
      firstSegmentAt: r.firstSegmentAt,
      lastSegmentAt: r.lastSegmentAt,
      totalSegments: r.totalSegments,
    }));
  }

  async getSegments(sessionId: string): Promise<TranscriptSegment[]> {
    return this.sessions.get(sessionId)?.segments ?? [];
  }

  async getSummary(sessionId: string): Promise<SegmentSummary> {
    const segments = this.sessions.get(sessionId)?.segments ?? [];
    return {
      sourceText: segments.map((s) => s.sourceText).filter(Boolean).join(" "),
      translatedText: segments.map((s) => s.translatedText).filter(Boolean).join(" "),
      segmentCount: segments.length,
    };
  }

  async close(): Promise<void> {
    // no-op for in-memory store
  }
}
