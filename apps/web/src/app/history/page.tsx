import Link from "next/link";
import type { SessionSummary } from "@sorisori/contracts";

interface PipelineSessionEntry {
  sessionId: string;
  totalSegments: number;
  firstSegmentAt: string | null;
  lastSegmentAt: string | null;
}

interface PipelineSessionsResponse {
  sessions: PipelineSessionEntry[];
}

function formatDuration(firstAt: string | null, lastAt: string | null): string {
  if (!firstAt || !lastAt) return "—";
  const diffMs = new Date(lastAt).getTime() - new Date(firstAt).getTime();
  if (diffMs <= 0) return "—";
  const totalSec = Math.floor(diffMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function toSessionSummary(entry: PipelineSessionEntry): SessionSummary {
  return {
    id: entry.sessionId,
    title: entry.sessionId,
    date: entry.firstSegmentAt ? entry.firstSegmentAt.slice(0, 10) : "—",
    durationLabel: formatDuration(entry.firstSegmentAt, entry.lastSegmentAt),
    archiveStatus: entry.totalSegments > 0 ? "saved" : "draft",
    sourceLanguage: "en",
    targetLanguage: "ko",
  };
}

async function fetchSessions(): Promise<SessionSummary[]> {
  const base = process.env.PIPELINE_API_URL ?? "http://127.0.0.1:8788";
  try {
    const res = await fetch(`${base}/sessions`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as PipelineSessionsResponse;
    return data.sessions.map(toSessionSummary);
  } catch {
    return [];
  }
}

export default async function HistoryPage() {
  const sessions = await fetchSessions();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10">
      <header className="glass-panel rounded-[2rem] px-6 py-6">
        <Link href="/" className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--teal)]">
          back to home
        </Link>
        <h1 className="display-face mt-4 text-4xl font-semibold sm:text-5xl">세션 기록 화면</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">
          MVP에서는 원문과 번역 세그먼트를 세션 단위로 다시 보는 흐름이 중요합니다. 지금은
          그 정보 구조를 먼저 잡아둔 상태입니다.
        </p>
      </header>

      <section className="mt-8 space-y-4">
        {sessions.length === 0 && (
          <p className="text-center text-[var(--ink-soft)]">저장된 세션이 없습니다.</p>
        )}
        {sessions.map((session) => (
          <Link key={session.id} href={`/session?id=${session.id}`}>
            <article className="glass-panel cursor-pointer rounded-[1.8rem] p-5 transition-opacity hover:opacity-80 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                    {session.date}
                  </p>
                  <h2 className="display-face mt-2 text-2xl font-semibold">{session.title}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[rgba(32,181,200,0.12)] px-3 py-1 text-sm font-medium text-[var(--cyan)]">
                    {session.archiveStatus}
                  </span>
                  <span className="mono-face text-sm text-[var(--ink-soft)]">{session.durationLabel}</span>
                </div>
              </div>
            </article>
          </Link>
        ))}
      </section>
    </main>
  );
}
