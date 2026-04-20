import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

import { SegmentStore } from "./segment-store.js";
import { GatewayClient } from "./gateway-client.js";

export interface PipelineServerHandle {
  host: string;
  port: number;
  close(): Promise<void>;
}

interface StartPipelineServerOptions {
  host?: string;
  port?: number;
  gatewayUrl?: string;
  sessionIds?: string[];
}

function nowIso() {
  return new Date().toISOString();
}

function jsonResponse(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown,
) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

export async function startPipelineServer(
  options: StartPipelineServerOptions = {},
): Promise<PipelineServerHandle> {
  const host = options.host ?? process.env.PIPELINE_HOST ?? "127.0.0.1";
  const requestedPort = options.port ?? Number(process.env.PIPELINE_PORT ?? "8788");
  const gatewayUrl =
    options.gatewayUrl ?? process.env.REALTIME_GATEWAY_WS_URL ?? "ws://127.0.0.1:8787/ws";
  const sessionIdList =
    options.sessionIds ??
    (process.env.PIPELINE_SESSION_IDS ?? "mvp-session-001").split(",").map((s) => s.trim());

  const store = new SegmentStore();

  const gatewayClient = new GatewayClient({
    gatewayUrl,
    sessionIds: sessionIdList,
    clientId: `pipeline-${randomUUID()}`,
    onSegmentUpserted: (event) => {
      store.upsert(event.sessionId, event.segment, event.occurredAt);
    },
    onLog: (message) => {
      console.log(message);
    },
  });

  const httpServer = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === "/health") {
      jsonResponse(res, 200, {
        status: "ok",
        service: "sorisori-pipeline",
        trackedSessions: store.getAllSessions().length,
        trackedSegments: store.getAllSessions().reduce((sum, s) => sum + s.totalSegments, 0),
        sessionIds: sessionIdList,
        gatewayUrl,
        occurredAt: nowIso(),
      });
      return;
    }

    if (url === "/sessions") {
      jsonResponse(res, 200, {
        sessions: store.getAllSessions().map((s) => ({
          sessionId: s.sessionId,
          totalSegments: s.totalSegments,
          firstSegmentAt: s.firstSegmentAt,
          lastSegmentAt: s.lastSegmentAt,
        })),
        occurredAt: nowIso(),
      });
      return;
    }

    const segmentsMatch = /^\/sessions\/([^/]+)\/segments$/.exec(url);
    if (segmentsMatch) {
      const sessionId = decodeURIComponent(segmentsMatch[1]);
      const session = store.getSession(sessionId);
      if (!session) {
        jsonResponse(res, 404, { error: "Session not found.", sessionId, occurredAt: nowIso() });
        return;
      }
      jsonResponse(res, 200, {
        sessionId,
        segments: session.segments,
        totalSegments: session.totalSegments,
        occurredAt: nowIso(),
      });
      return;
    }

    const summaryMatch = /^\/sessions\/([^/]+)\/summary$/.exec(url);
    if (summaryMatch) {
      const sessionId = decodeURIComponent(summaryMatch[1]);
      const session = store.getSession(sessionId);
      if (!session) {
        jsonResponse(res, 404, { error: "Session not found.", sessionId, occurredAt: nowIso() });
        return;
      }
      const summary = store.getSummary(sessionId);
      jsonResponse(res, 200, {
        sessionId,
        ...summary,
        firstSegmentAt: session.firstSegmentAt,
        lastSegmentAt: session.lastSegmentAt,
        occurredAt: nowIso(),
      });
      return;
    }

    jsonResponse(res, 404, {
      error: "Not found.",
      routes: ["/health", "/sessions", "/sessions/:id/segments", "/sessions/:id/summary"],
      occurredAt: nowIso(),
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(requestedPort, host);
  });

  gatewayClient.start();

  const address = httpServer.address() as AddressInfo;

  return {
    host,
    port: address.port,
    async close() {
      gatewayClient.stop();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function main() {
  const handle = await startPipelineServer();
  console.log(
    `[sorisori-pipeline] listening on http://${handle.host}:${handle.port} (health: /health)`,
  );
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === new URL(`file://${entryPath}`).href) {
  main().catch((error: unknown) => {
    console.error("[sorisori-pipeline] failed to start", error);
    process.exitCode = 1;
  });
}
