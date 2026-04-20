"use client";

import { useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import TranscriptLane from "./TranscriptLane";

interface SessionRuntimeProps {
  gatewayUrl: string;
  defaultSessionId: string;
}

function normalizeSessionId(rawValue: string | null | undefined, fallback: string): string {
  const trimmed = rawValue?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

interface SessionIdFormProps {
  activeSessionId: string;
  defaultSessionId: string;
}

function SessionIdForm({ activeSessionId, defaultSessionId }: SessionIdFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [draftSessionId, setDraftSessionId] = useState(activeSessionId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextSessionId = normalizeSessionId(draftSessionId, defaultSessionId);
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextSessionId === defaultSessionId) {
      nextParams.delete("id");
    } else {
      nextParams.set("id", nextSessionId);
    }

    const nextQuery = nextParams.toString();

    startTransition(() => {
      router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    });
  }

  return (
    <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
      <label className="flex-1">
        <span className="sr-only">Session ID</span>
        <input
          value={draftSessionId}
          onChange={(event) => setDraftSessionId(event.target.value)}
          placeholder={defaultSessionId}
          className="w-full rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-5 py-3 text-base text-[var(--ink)] outline-none transition focus:border-[var(--teal)] focus:ring-2 focus:ring-[rgba(15,118,110,0.16)]"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-[var(--ink)] px-5 py-3 text-base font-semibold text-white transition hover:opacity-92 disabled:cursor-wait disabled:opacity-70"
      >
        {isPending ? "연결 전환 중..." : "세션 보기"}
      </button>
    </form>
  );
}

export default function SessionRuntime({
  gatewayUrl,
  defaultSessionId,
}: SessionRuntimeProps) {
  const searchParams = useSearchParams();

  const activeSessionId = normalizeSessionId(searchParams.get("id"), defaultSessionId);

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[2rem] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--ink-soft)]">
              session routing
            </p>
            <h2 className="display-face mt-2 text-2xl font-semibold">viewer session target</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
              `/session?id=...` 형식으로 웹 뷰어가 특정 세션을 바로 구독할 수 있습니다.
              기본 세션을 그대로 쓰면 쿼리 파라미터는 생략됩니다.
            </p>
          </div>

          <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.56)] px-4 py-3">
            <p className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
              current session
            </p>
            <p className="mt-2 text-lg font-semibold break-all">{activeSessionId}</p>
          </div>
        </div>

        <SessionIdForm
          key={activeSessionId}
          activeSessionId={activeSessionId}
          defaultSessionId={defaultSessionId}
        />

        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          예시: <span className="mono-face">/session?id=mvp-session-001</span>
        </p>
      </section>

      <TranscriptLane
        key={`${gatewayUrl}::${activeSessionId}`}
        gatewayUrl={gatewayUrl}
        sessionId={activeSessionId}
      />
    </div>
  );
}
