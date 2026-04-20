import Link from "next/link";
import {
  DEFAULT_SESSION_SOURCES,
  MVP_AUDIO_CONVERSION_PLAN,
  MVP_SESSION_METRICS,
  type TranscriptSegment,
} from "@sorisori/contracts";

const transcriptRows: Array<TranscriptSegment & { time: string }> = [
  {
    id: "seg-001",
    seq: 1,
    startMs: 14000,
    endMs: 15800,
    time: "00:14",
    sourceText: "The speaker is comparing streaming latency across providers.",
    translatedText: "화자가 공급자별 스트리밍 지연 시간을 비교하고 있습니다.",
    isFinal: true,
    confidence: 0.94,
  },
  {
    id: "seg-002",
    seq: 2,
    startMs: 16000,
    endMs: 17700,
    time: "00:16",
    sourceText: "We will keep the Korean subtitle layer readable before chasing extra features.",
    translatedText: "추가 기능보다 먼저 한국어 자막 레이어의 가독성을 안정화하겠습니다.",
    isFinal: true,
    confidence: 0.92,
  },
  {
    id: "seg-003",
    seq: 3,
    startMs: 18000,
    endMs: 19600,
    time: "00:18",
    sourceText: "Windows loopback is already locked as the MVP capture strategy.",
    translatedText: "Windows loopback은 이미 MVP 캡처 전략으로 확정됐습니다.",
    isFinal: true,
    confidence: 0.96,
  },
];

export default function SessionPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <header className="glass-panel flex flex-col gap-6 rounded-[2rem] px-6 py-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/" className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--teal)]">
            back to home
          </Link>
          <h1 className="display-face mt-4 text-4xl font-semibold sm:text-5xl">세션 제어 화면</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">
            실제 스트리밍 연결 전이라도, 사용자가 어떤 소스를 선택하고 어떤 자막 흐름을 보게
            되는지 바로 확인할 수 있는 기본 레이아웃입니다.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.56)] px-4 py-3">
            <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">mode</p>
            <p className="mt-2 text-lg font-semibold">{MVP_SESSION_METRICS.mode}</p>
          </div>
          <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.56)] px-4 py-3">
            <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">target</p>
            <p className="mt-2 text-lg font-semibold">{MVP_SESSION_METRICS.targetLanguage}</p>
          </div>
          <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.56)] px-4 py-3">
            <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">latency</p>
            <p className="mt-2 text-lg font-semibold">goal {MVP_SESSION_METRICS.latencyGoalLabel}</p>
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-6 xl:grid-cols-[0.42fr_0.58fr]">
        <aside className="glass-panel rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--ink-soft)]">
                source select
              </p>
              <h2 className="display-face mt-2 text-2xl font-semibold">input routing</h2>
            </div>
            <span className="rounded-full bg-[rgba(15,118,110,0.12)] px-3 py-1 text-sm font-medium text-[var(--teal)]">
              standby
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {DEFAULT_SESSION_SOURCES.map((source, index) => (
              <button
                key={source.id}
                className={`w-full rounded-[1.3rem] border px-4 py-4 text-left transition ${
                  index === 0
                    ? "border-[var(--teal)] bg-[rgba(15,118,110,0.08)]"
                    : "border-[var(--line)] bg-[rgba(255,255,255,0.5)]"
                }`}
              >
                <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                  source {index + 1}
                </p>
                <p className="mt-2 text-lg font-semibold">{source.label}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{source.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <button className="rounded-full bg-[var(--ink)] px-5 py-3 text-base font-semibold text-white">
              세션 시작
            </button>
            <button className="rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.5)] px-5 py-3 text-base font-semibold text-[var(--ink)]">
              연결 테스트
            </button>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="glass-panel rounded-[2rem] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--ink-soft)]">
                  live subtitles
                </p>
                <h2 className="display-face mt-2 text-2xl font-semibold">dual transcript lane</h2>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-[rgba(255,107,74,0.08)] px-3 py-2 text-sm text-[var(--coral)]">
                <span className="pulse-dot h-2 w-2 rounded-full bg-[var(--coral)]" />
                not connected yet
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {transcriptRows.map((row) => (
                <article key={row.id} className="rounded-[1.6rem] bg-[rgba(255,255,255,0.62)] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                      {row.time}
                    </span>
                    <span className="rounded-full bg-[rgba(32,181,200,0.12)] px-3 py-1 text-xs font-medium text-[var(--cyan)]">
                      {Math.round(row.confidence * 100)}% confident
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-[var(--ink-soft)]">{row.sourceText}</p>
                  <p className="mt-3 text-base leading-7 font-semibold text-[var(--ink)]">
                    {row.translatedText}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="glass-panel rounded-[1.8rem] p-5">
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                format
              </p>
              <p className="mt-3 text-lg font-semibold">{MVP_SESSION_METRICS.inputFormatLabel}</p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                {MVP_AUDIO_CONVERSION_PLAN.chunkDurationMs}ms chunks
              </p>
            </div>
            <div className="glass-panel rounded-[1.8rem] p-5">
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                stt
              </p>
              <p className="mt-3 text-lg font-semibold">{MVP_SESSION_METRICS.providers.transcription}</p>
            </div>
            <div className="glass-panel rounded-[1.8rem] p-5">
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                translation
              </p>
              <p className="mt-3 text-lg font-semibold">{MVP_SESSION_METRICS.providers.translation}</p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
