import Link from "next/link";

import {
  fetchSessionDetail,
  formatDateTimeLabel,
  formatSegmentClock,
} from "@/lib/pipeline";

interface SessionDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

function EmptyState({
  sessionId,
  mode,
}: {
  sessionId: string;
  mode: "not-found" | "unavailable";
}) {
  const title =
    mode === "not-found" ? "세션을 찾을 수 없습니다." : "pipeline 서비스에 연결할 수 없습니다.";
  const description =
    mode === "not-found"
      ? "해당 세션 ID로 저장된 요약이나 세그먼트가 아직 없습니다."
      : "services/pipeline이 꺼져 있거나 응답하지 않아 세션 기록을 불러오지 못했습니다.";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-10">
      <header className="glass-panel rounded-[2rem] px-6 py-6">
        <Link href="/history" className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--teal)]">
          back to history
        </Link>
        <h1 className="display-face mt-4 text-4xl font-semibold sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">{description}</p>
      </header>

      <section className="glass-panel mt-8 rounded-[2rem] p-6">
        <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
          requested session
        </p>
        <p className="mt-3 text-xl font-semibold break-all">{sessionId}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/history"
            className="inline-flex items-center justify-center rounded-full bg-[var(--ink)] px-5 py-3 text-base font-semibold text-white"
          >
            기록 화면으로 돌아가기
          </Link>
          <Link
            href={`/session?id=${encodeURIComponent(sessionId)}`}
            className="inline-flex items-center justify-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.58)] px-5 py-3 text-base font-semibold text-[var(--ink)]"
          >
            실시간 뷰어로 이동
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { id } = await params;
  const sessionId = decodeURIComponent(id);
  const result = await fetchSessionDetail(sessionId);

  if (result.status !== "ok") {
    return <EmptyState sessionId={sessionId} mode={result.status} />;
  }

  const { detail } = result;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <header className="glass-panel rounded-[2rem] px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/history" className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--teal)]">
                back to history
              </Link>
              <Link
                href={`/session?id=${encodeURIComponent(sessionId)}`}
                className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--cyan)]"
              >
                open live viewer
              </Link>
            </div>
            <h1 className="display-face mt-4 text-4xl font-semibold break-all sm:text-5xl">
              {detail.session.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--ink-soft)]">
              pipeline에 저장된 전체 세그먼트와 요약 텍스트를 한 번에 보는 상세 화면입니다.
              실시간 화면은 별도 뷰어로 유지하고, 여기서는 세션 아카이브 읽기에 집중합니다.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.56)] px-4 py-3">
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">segments</p>
              <p className="mt-2 text-lg font-semibold">{detail.totalSegments}</p>
            </div>
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.56)] px-4 py-3">
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">duration</p>
              <p className="mt-2 text-lg font-semibold">{detail.session.durationLabel}</p>
            </div>
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.56)] px-4 py-3">
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">status</p>
              <p className="mt-2 text-lg font-semibold">{detail.session.archiveStatus}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-6 xl:grid-cols-[0.42fr_0.58fr]">
        <aside className="space-y-6">
          <div className="glass-panel rounded-[2rem] p-6">
            <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
              session window
            </p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--ink-soft)]">
              <p>
                시작: <span className="font-medium text-[var(--ink)]">{formatDateTimeLabel(detail.firstSegmentAt)}</span>
              </p>
              <p>
                종료: <span className="font-medium text-[var(--ink)]">{formatDateTimeLabel(detail.lastSegmentAt)}</span>
              </p>
              <p>
                언어: <span className="font-medium text-[var(--ink)]">en → ko</span>
              </p>
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] p-6">
            <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
              translated summary
            </p>
            <p className="mt-4 text-base leading-7 text-[var(--ink)] whitespace-pre-wrap">
              {detail.translatedText || "아직 번역 요약이 없습니다."}
            </p>
          </div>

          <div className="glass-panel rounded-[2rem] p-6">
            <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
              source summary
            </p>
            <p className="mt-4 text-sm leading-7 text-[var(--ink-soft)] whitespace-pre-wrap">
              {detail.sourceText || "아직 원문 요약이 없습니다."}
            </p>
          </div>
        </aside>

        <section className="glass-panel rounded-[2rem] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                segment archive
              </p>
              <h2 className="display-face mt-2 text-2xl font-semibold">full segment list</h2>
            </div>
            <span className="rounded-full bg-[rgba(32,181,200,0.12)] px-3 py-1 text-sm font-medium text-[var(--cyan)]">
              {detail.totalSegments} items
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {detail.segments.length === 0 ? (
              <p className="rounded-[1.6rem] bg-[rgba(255,255,255,0.6)] p-5 text-sm text-[var(--ink-soft)]">
                저장된 세그먼트가 아직 없습니다.
              </p>
            ) : (
              detail.segments.map((segment) => (
                <article key={segment.id} className="rounded-[1.6rem] bg-[rgba(255,255,255,0.62)] p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                        #{segment.seq}
                      </span>
                      <span className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                        {formatSegmentClock(segment.startMs)} - {formatSegmentClock(segment.endMs)}
                      </span>
                    </div>
                    <span className="rounded-full bg-[rgba(15,118,110,0.12)] px-3 py-1 text-xs font-medium text-[var(--teal)]">
                      {Math.round(segment.confidence * 100)}% confident
                    </span>
                  </div>

                  <p className="text-sm leading-6 text-[var(--ink-soft)]">{segment.sourceText}</p>
                  <p className="mt-3 text-base leading-7 font-semibold text-[var(--ink)]">
                    {segment.translatedText || "번역 결과가 아직 없습니다."}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
