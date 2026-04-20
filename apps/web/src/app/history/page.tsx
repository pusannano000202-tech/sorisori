import Link from "next/link";
import type { SessionSummary } from "@sorisori/contracts";

const sessions: SessionSummary[] = [
  {
    id: "session-001",
    title: "Product webinar capture",
    date: "2026-04-19",
    durationLabel: "18m 42s",
    archiveStatus: "saved",
    sourceLanguage: "en",
    targetLanguage: "ko",
  },
  {
    id: "session-002",
    title: "Gaming stream subtitle test",
    date: "2026-04-18",
    durationLabel: "09m 10s",
    archiveStatus: "draft",
    sourceLanguage: "ja",
    targetLanguage: "ko",
  },
  {
    id: "session-003",
    title: "YouTube lecture latency benchmark",
    date: "2026-04-17",
    durationLabel: "26m 02s",
    archiveStatus: "saved",
    sourceLanguage: "en",
    targetLanguage: "ko",
  },
];

export default function HistoryPage() {
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
        {sessions.map((session) => (
          <article key={session.id} className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
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
        ))}
      </section>
    </main>
  );
}
