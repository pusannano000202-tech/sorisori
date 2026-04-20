import { PrismaClient } from "@prisma/client";
import type { Session, Segment } from "@prisma/client";
import type { TranscriptSegment } from "@sorisori/contracts";
import type { ISegmentStore, SessionRecord, SegmentSummary } from "./store-interface.js";

function toTranscriptSegment(row: {
  id: string;
  seq: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  translatedText: string;
  isFinal: boolean;
  confidence: number;
}): TranscriptSegment {
  return {
    id: row.id,
    seq: row.seq,
    startMs: row.startMs,
    endMs: row.endMs,
    sourceText: row.sourceText,
    translatedText: row.translatedText,
    isFinal: row.isFinal,
    confidence: row.confidence,
  };
}

export class PostgresSegmentStore implements ISegmentStore {
  private readonly prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
  }

  async upsert(sessionId: string, segment: TranscriptSegment, occurredAt: string): Promise<void> {
    const occurredDate = new Date(occurredAt);

    await this.prisma.$transaction([
      this.prisma.segment.upsert({
        where: { id: segment.id },
        create: {
          id: segment.id,
          sessionId,
          seq: segment.seq,
          startMs: segment.startMs,
          endMs: segment.endMs,
          sourceText: segment.sourceText,
          translatedText: segment.translatedText,
          isFinal: segment.isFinal,
          confidence: segment.confidence,
        },
        update: {
          seq: segment.seq,
          startMs: segment.startMs,
          endMs: segment.endMs,
          sourceText: segment.sourceText,
          translatedText: segment.translatedText,
          isFinal: segment.isFinal,
          confidence: segment.confidence,
        },
      }),
      this.prisma.session.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          firstSegmentAt: occurredDate,
          lastSegmentAt: occurredDate,
          totalSegments: 1,
        },
        update: {
          lastSegmentAt: occurredDate,
          totalSegments: { increment: 1 },
        },
      }),
    ]);
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    const row: Session | null = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!row) return undefined;
    return {
      sessionId: row.id,
      firstSegmentAt: row.firstSegmentAt?.toISOString() ?? null,
      lastSegmentAt: row.lastSegmentAt?.toISOString() ?? null,
      totalSegments: row.totalSegments,
    };
  }

  async getAllSessions(): Promise<SessionRecord[]> {
    const rows = await this.prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row: Session) => ({
      sessionId: row.id,
      firstSegmentAt: row.firstSegmentAt?.toISOString() ?? null,
      lastSegmentAt: row.lastSegmentAt?.toISOString() ?? null,
      totalSegments: row.totalSegments,
    }));
  }

  async getSegments(sessionId: string): Promise<TranscriptSegment[]> {
    const rows = await this.prisma.segment.findMany({
      where: { sessionId },
      orderBy: { seq: "asc" },
    });
    return rows.map((row: Segment) => toTranscriptSegment(row));
  }

  async getSummary(sessionId: string): Promise<SegmentSummary> {
    const segments = await this.getSegments(sessionId);
    return {
      sourceText: segments.map((s) => s.sourceText).filter(Boolean).join(" "),
      translatedText: segments.map((s) => s.translatedText).filter(Boolean).join(" "),
      segmentCount: segments.length,
    };
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
