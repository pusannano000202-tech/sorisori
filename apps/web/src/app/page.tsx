import Link from "next/link";

const features = [
  {
    title: "Windows Loopback Ready",
    description:
      "WASAPI loopback 기준으로 시스템 출력 오디오를 잡고, OpenAI Realtime 입력 포맷으로 맞추는 흐름을 전제로 설계했습니다.",
  },
  {
    title: "Realtime Subtitle Surface",
    description:
      "세션 제어, 라이브 자막, 기록 저장 흐름이 한 화면 안에서 이어지도록 웹과 데스크톱 UI를 같은 정보 구조로 맞춥니다.",
  },
  {
    title: "Checkpoint First Build",
    description:
      "Codex와 Claude가 교대해도 끊기지 않도록 의사결정, 작업 로그, 체크포인트를 저장소 안에 남기는 방식을 기본으로 둡니다.",
  },
];

const flow = [
  "1. 시스템 오디오 또는 탭 오디오 선택",
  "2. 실시간 전사와 한국어 번역 스트림 연결",
  "3. 자막 표시와 세션 기록 저장",
];

const liveTranscript = [
  {
    speaker: "Source",
    time: "00:07",
    text: "The host is switching to the final segment of the webinar.",
  },
  {
    speaker: "Korean",
    time: "00:08",
    text: "진행자가 지금 웨비나의 마지막 세그먼트로 넘어가고 있습니다.",
  },
  {
    speaker: "Latency",
    time: "2.1s",
    text: "PCM16 / 24kHz / mono pipeline locked.",
  },
];

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,_rgba(255,107,74,0.18),_transparent_60%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-20 pt-8 sm:px-10 lg:px-12">
        <header className="glass-panel sticky top-4 z-20 flex items-center justify-between rounded-full px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="pulse-dot inline-flex h-3 w-3 rounded-full bg-[var(--coral)]" />
            <div>
              <p className="mono-face text-xs uppercase tracking-[0.3em] text-[var(--ink-soft)]">
                SoriSori
              </p>
              <p className="text-sm font-medium">foreign audio to Korean subtitles</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[var(--ink-soft)] sm:flex">
            <Link href="/session">Session</Link>
            <Link href="/history">History</Link>
            <Link href="#stack">Stack</Link>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.62)] px-4 py-2 text-sm text-[var(--ink-soft)]">
              <span className="mono-face text-xs uppercase tracking-[0.28em]">phase 0 / step 2</span>
              <span>web control surface scaffold</span>
            </div>

            <div className="space-y-6">
              <p className="mono-face text-sm uppercase tracking-[0.32em] text-[var(--teal)]">
                Real-time subtitle companion
              </p>
              <h1 className="display-face max-w-4xl text-5xl leading-[0.92] font-semibold text-balance sm:text-6xl lg:text-8xl">
                기기에서 나오는 외국어를
                <br />
                한국어 자막 흐름으로 바꾸는 시작 화면
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[var(--ink-soft)] sm:text-xl">
                SoriSori는 웹에서 세션을 관리하고, 데스크톱 앱에서 시스템 오디오를 잡아,
                실시간 한국어 자막과 기록을 한 흐름으로 묶는 프로젝트입니다. 지금 단계에서는
                제품의 첫 인상과 정보 구조를 바로 볼 수 있는 웹 골격을 올렸습니다.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href="/session"
                className="inline-flex items-center justify-center rounded-full bg-[var(--ink)] px-6 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5"
              >
                세션 화면 보기
              </Link>
              <Link
                href="/history"
                className="inline-flex items-center justify-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.55)] px-6 py-3 text-base font-semibold text-[var(--ink)] transition hover:border-[var(--ink)]"
              >
                기록 화면 보기
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {flow.map((item) => (
                <div key={item} className="glass-panel rounded-3xl p-4">
                  <p className="text-sm leading-6 text-[var(--ink-soft)]">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="drift-card glass-panel signal-grid relative rounded-[2rem] p-6 sm:p-8">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--ink-soft)]">
                  live relay preview
                </p>
                <h2 className="display-face mt-2 text-3xl font-semibold">subtitle monitor</h2>
              </div>
              <div className="rounded-full border border-[rgba(15,118,110,0.2)] bg-[rgba(15,118,110,0.1)] px-3 py-1 text-sm font-medium text-[var(--teal)]">
                connected
              </div>
            </div>

            <div className="mb-6 grid grid-cols-10 items-end gap-2 rounded-[1.5rem] bg-[rgba(20,36,61,0.06)] px-4 py-6">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="signal-bar rounded-full bg-[linear-gradient(180deg,_var(--coral),_var(--cyan))]"
                  style={{
                    height: `${36 + ((index % 5) + 1) * 16}px`,
                    animationDelay: `${index * 0.12}s`,
                  }}
                />
              ))}
            </div>

            <div className="space-y-3">
              {liveTranscript.map((item) => (
                <div key={`${item.speaker}-${item.time}`} className="rounded-[1.4rem] bg-[var(--paper)] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                      {item.speaker}
                    </span>
                    <span className="mono-face text-xs text-[var(--ink-soft)]">{item.time}</span>
                  </div>
                  <p className="text-sm leading-6 text-[var(--ink)] sm:text-base">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 py-6 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="glass-panel rounded-[2rem] p-6">
              <p className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--teal)]">
                focus
              </p>
              <h2 className="display-face mt-4 text-2xl font-semibold">{feature.title}</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--ink-soft)] sm:text-base">
                {feature.description}
              </p>
            </article>
          ))}
        </section>

        <section
          id="stack"
          className="glass-panel mt-10 grid gap-8 rounded-[2.4rem] px-6 py-8 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="space-y-4">
            <p className="mono-face text-xs uppercase tracking-[0.3em] text-[var(--ink-soft)]">
              selected stack
            </p>
            <h2 className="display-face text-4xl font-semibold">웹은 제어면, 데스크톱은 캡처면</h2>
            <p className="text-base leading-7 text-[var(--ink-soft)]">
              현재 기준선은 Next.js 16.2, React 19.2, Windows WASAPI loopback, OpenAI realtime
              transcription, DeepL translation 조합입니다.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(255,255,255,0.54)] p-5">
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                web
              </p>
              <p className="mt-3 text-lg font-semibold">Next.js App Router</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                세션 생성, 라이브 자막, 기록 조회, 운영 문서를 함께 묶는 시작점입니다.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(255,255,255,0.54)] p-5">
              <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                desktop
              </p>
              <p className="mt-3 text-lg font-semibold">Tauri + WASAPI</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                시스템 출력 오디오 캡처와 포맷 변환 계층의 핵심 책임을 맡습니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
