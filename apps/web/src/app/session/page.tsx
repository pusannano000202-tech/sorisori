import Link from "next/link";
import {
  DEFAULT_SESSION_SOURCES,
  MVP_AUDIO_CONVERSION_PLAN,
  MVP_SESSION_METRICS,
} from "@sorisori/contracts";
import SessionRuntime from "./SessionRuntime";

const GATEWAY_WS_URL =
  process.env.NEXT_PUBLIC_REALTIME_WS_URL ?? "ws://localhost:8787/ws";

const DEFAULT_SESSION_ID =
  process.env.NEXT_PUBLIC_DEFAULT_SESSION_ID ?? "mvp-session-001";

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
          <SessionRuntime gatewayUrl={GATEWAY_WS_URL} defaultSessionId={DEFAULT_SESSION_ID} />

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
