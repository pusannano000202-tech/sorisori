import type { SessionSummary, TranscriptSegment } from "@sorisori/contracts";

export interface PipelineSessionEntry {
  sessionId: string;
  totalSegments: number;
  firstSegmentAt: string | null;
  lastSegmentAt: string | null;
}

interface PipelineSessionsResponse {
  sessions: PipelineSessionEntry[];
}

interface PipelineSessionSummaryResponse {
  sessionId: string;
  sourceText: string;
  translatedText: string;
  segmentCount: number;
  firstSegmentAt: string | null;
  lastSegmentAt: string | null;
}

interface PipelineSessionSegmentsResponse {
  sessionId: string;
  segments: TranscriptSegment[];
  totalSegments: number;
}

interface FetchOk<T> {
  status: "ok";
  data: T;
}

interface FetchNotFound {
  status: "not-found";
}

interface FetchUnavailable {
  status: "unavailable";
}

type FetchResult<T> = FetchOk<T> | FetchNotFound | FetchUnavailable;

export interface SessionDetailData {
  session: SessionSummary;
  totalSegments: number;
  firstSegmentAt: string | null;
  lastSegmentAt: string | null;
  sourceText: string;
  translatedText: string;
  segments: TranscriptSegment[];
}

export type SessionDetailFetchResult =
  | {
      status: "ok";
      detail: SessionDetailData;
    }
  | FetchNotFound
  | FetchUnavailable;

function getPipelineBaseUrl(): string {
  return process.env.PIPELINE_API_URL ?? "http://127.0.0.1:8788";
}

function toSessionSummary(entry: PipelineSessionEntry): SessionSummary {
  return {
    id: entry.sessionId,
    title: entry.sessionId,
    date: entry.firstSegmentAt ? entry.firstSegmentAt.slice(0, 10) : "—",
    durationLabel: formatDurationLabel(entry.firstSegmentAt, entry.lastSegmentAt),
    archiveStatus: entry.totalSegments > 0 ? "saved" : "draft",
    sourceLanguage: "en",
    targetLanguage: "ko",
  };
}

async function fetchPipelineJson<T>(path: string): Promise<FetchResult<T>> {
  try {
    const response = await fetch(`${getPipelineBaseUrl()}${path}`, { cache: "no-store" });

    if (response.status === 404) {
      return { status: "not-found" };
    }

    if (!response.ok) {
      return { status: "unavailable" };
    }

    return {
      status: "ok",
      data: (await response.json()) as T,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await fetchPipelineJson<PipelineSessionsResponse>("/sessions");
  if (response.status !== "ok") {
    return [];
  }
  return response.data.sessions.map(toSessionSummary);
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionDetailFetchResult> {
  const encodedSessionId = encodeURIComponent(sessionId);

  const [summaryResponse, segmentsResponse] = await Promise.all([
    fetchPipelineJson<PipelineSessionSummaryResponse>(`/sessions/${encodedSessionId}/summary`),
    fetchPipelineJson<PipelineSessionSegmentsResponse>(`/sessions/${encodedSessionId}/segments`),
  ]);

  if (summaryResponse.status === "not-found" || segmentsResponse.status === "not-found") {
    return { status: "not-found" };
  }

  if (summaryResponse.status !== "ok" || segmentsResponse.status !== "ok") {
    return { status: "unavailable" };
  }

  return {
    status: "ok",
    detail: {
      session: {
        id: summaryResponse.data.sessionId,
        title: summaryResponse.data.sessionId,
        date: summaryResponse.data.firstSegmentAt
          ? summaryResponse.data.firstSegmentAt.slice(0, 10)
          : "—",
        durationLabel: formatDurationLabel(
          summaryResponse.data.firstSegmentAt,
          summaryResponse.data.lastSegmentAt,
        ),
        archiveStatus: summaryResponse.data.segmentCount > 0 ? "saved" : "draft",
        sourceLanguage: "en",
        targetLanguage: "ko",
      },
      totalSegments: summaryResponse.data.segmentCount,
      firstSegmentAt: summaryResponse.data.firstSegmentAt,
      lastSegmentAt: summaryResponse.data.lastSegmentAt,
      sourceText: summaryResponse.data.sourceText,
      translatedText: summaryResponse.data.translatedText,
      segments: segmentsResponse.data.segments,
    },
  };
}

export function formatDurationLabel(
  firstAt: string | null,
  lastAt: string | null,
): string {
  if (!firstAt || !lastAt) return "—";

  const diffMs = new Date(lastAt).getTime() - new Date(firstAt).getTime();
  if (diffMs <= 0) return "—";

  const totalSec = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatDateTimeLabel(value: string | null): string {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatSegmentClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
