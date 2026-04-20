"use client";

import { useEffect, useRef, useState } from "react";
import type {
  RealtimeGatewayServerMessage,
  RealtimeSegmentUpsertedMessage,
  TranscriptSegment,
} from "@sorisori/contracts";

interface TranscriptLaneProps {
  gatewayUrl: string;
  sessionId: string;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function TranscriptLane({ gatewayUrl, sessionId }: TranscriptLaneProps) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    gatewayUrl && sessionId ? "connecting" : "disconnected",
  );
  const [statusMessage, setStatusMessage] = useState(() =>
    gatewayUrl && sessionId
      ? `세션 ${sessionId}에 연결 중...`
      : "게이트웨이에 연결되지 않았습니다.",
  );
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!gatewayUrl || !sessionId) {
      return;
    }

    const ws = new WebSocket(gatewayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "gateway.hello",
          clientId: `web-viewer-${sessionId}`,
          role: "web-viewer",
          occurredAt: new Date().toISOString(),
        }),
      );
      ws.send(
        JSON.stringify({
          type: "session.join",
          sessionId,
          occurredAt: new Date().toISOString(),
        }),
      );
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let payload: RealtimeGatewayServerMessage;
      try {
        payload = JSON.parse(event.data) as RealtimeGatewayServerMessage;
      } catch {
        return;
      }

      if (payload.type === "session.state") {
        setStatus("connected");
        setStatusMessage(`세션 ${payload.sessionId} 연결됨 (${payload.status})`);
      } else if (payload.type === "provider.state") {
        setStatusMessage(`공급자: ${payload.status} — ${payload.message}`);
      } else if (payload.type === "segment.upserted") {
        const upserted = payload as RealtimeSegmentUpsertedMessage;
        if (upserted.sessionId === sessionId) {
          setSegments((prev) => {
            const existing = prev.findIndex((s) => s.id === upserted.segment.id);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = upserted.segment;
              return next.sort((left, right) => left.startMs - right.startMs);
            }
            return [...prev, upserted.segment].sort((left, right) => left.startMs - right.startMs);
          });
        }
      } else if (payload.type === "gateway.error") {
        setStatusMessage(`오류: ${payload.message}`);
        if (!payload.recoverable) {
          setStatus("error");
        }
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setStatusMessage("WebSocket 연결 오류");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      setStatusMessage("게이트웨이 연결이 종료됐습니다.");
      wsRef.current = null;
    };

    return () => {
      ws.close();
    };
  }, [gatewayUrl, sessionId]);

  const statusColor =
    status === "connected"
      ? "var(--teal)"
      : status === "connecting"
        ? "var(--cyan)"
        : status === "error"
          ? "var(--coral)"
          : "var(--ink-soft)";

  return (
    <div className="glass-panel rounded-[2rem] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mono-face text-xs uppercase tracking-[0.28em] text-[var(--ink-soft)]">
            live subtitles
          </p>
          <h2 className="display-face mt-2 text-2xl font-semibold">dual transcript lane</h2>
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-3 py-2 text-sm"
          style={{ background: `color-mix(in srgb, ${statusColor} 10%, transparent)`, color: statusColor }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: statusColor }} />
          {statusMessage}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {segments.length === 0 ? (
          <p className="rounded-[1.6rem] bg-[rgba(255,255,255,0.62)] p-5 text-sm text-[var(--ink-soft)]">
            {status === "connected" ? "오디오가 인식되면 자막이 여기 표시됩니다." : "세션을 시작하면 실시간 자막이 표시됩니다."}
          </p>
        ) : (
          segments.map((seg) => (
            <article key={seg.id} className="rounded-[1.6rem] bg-[rgba(255,255,255,0.62)] p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="mono-face text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                  {formatMs(seg.startMs)} - {formatMs(seg.endMs)}
                </span>
                <span className="rounded-full bg-[rgba(32,181,200,0.12)] px-3 py-1 text-xs font-medium text-[var(--cyan)]">
                  {Math.round(seg.confidence * 100)}% confident
                </span>
              </div>
              <p className="text-sm leading-6 text-[var(--ink-soft)]">{seg.sourceText}</p>
              {seg.translatedText ? (
                <p className="mt-3 text-base leading-7 font-semibold text-[var(--ink)]">
                  {seg.translatedText}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)] italic">번역 중...</p>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
