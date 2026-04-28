import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

import type { ISegmentStore } from "./store-interface.js";
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
  store?: ISegmentStore;
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

async function createStore(databaseUrl: string | undefined): Promise<ISegmentStore> {
  if (databaseUrl) {
    const { PostgresSegmentStore } = await import("./postgres-segment-store.js");
    console.log("[sorisori-pipeline] Using PostgreSQL segment store.");
    return new PostgresSegmentStore(databaseUrl);
  }
  console.log("[sorisori-pipeline] DATABASE_URL not set — using in-memory segment store.");
  return new SegmentStore();
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
  const databaseUrl = process.env.DATABASE_URL;

  const store: ISegmentStore = options.store ?? (await createStore(databaseUrl));

  const gatewayClient = new GatewayClient({
    gatewayUrl,
    sessionIds: sessionIdList,
    clientId: `pipeline-${randomUUID()}`,
    onSegmentUpserted: (event) => {
      void store.upsert(event.sessionId, event.segment, event.occurredAt);
    },
    onLog: (message) => {
      console.log(message);
    },
  });

  const httpServer = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === "/health") {
      void (async () => {
        const sessions = await store.getAllSessions();
        jsonResponse(res, 200, {
          status: "ok",
          service: "sorisori-pipeline",
          backend: databaseUrl ? "postgresql" : "in-memory",
          trackedSessions: sessions.length,
          trackedSegments: sessions.reduce((sum, s) => sum + s.totalSegments, 0),
          sessionIds: sessionIdList,
          gatewayUrl,
          occurredAt: nowIso(),
        });
      })();
      return;
    }

    if (url === "/sessions") {
      void (async () => {
        const sessions = await store.getAllSessions();
        jsonResponse(res, 200, {
          sessions: sessions.map((s) => ({
            sessionId: s.sessionId,
            totalSegments: s.totalSegments,
            firstSegmentAt: s.firstSegmentAt,
            lastSegmentAt: s.lastSegmentAt,
          })),
          occurredAt: nowIso(),
        });
      })();
      return;
    }

    const segmentsMatch = /^\/sessions\/([^/]+)\/segments$/.exec(url);
    if (segmentsMatch) {
      const sessionId = decodeURIComponent(segmentsMatch[1]);
      void (async () => {
        const session = await store.getSession(sessionId);
        if (!session) {
          jsonResponse(res, 404, { error: "Session not found.", sessionId, occurredAt: nowIso() });
          return;
        }
        const segments = await store.getSegments(sessionId);
        jsonResponse(res, 200, {
          sessionId,
          segments,
          totalSegments: session.totalSegments,
          occurredAt: nowIso(),
        });
      })();
      return;
    }

    const summaryMatch = /^\/sessions\/([^/]+)\/summary$/.exec(url);
    if (summaryMatch) {
      const sessionId = decodeURIComponent(summaryMatch[1]);
      void (async () => {
        const session = await store.getSession(sessionId);
        if (!session) {
          jsonResponse(res, 404, { error: "Session not found.", sessionId, occurredAt: nowIso() });
          return;
        }
        const summary = await store.getSummary(sessionId);
        jsonResponse(res, 200, {
          sessionId,
          ...summary,
          firstSegmentAt: session.firstSegmentAt,
          lastSegmentAt: session.lastSegmentAt,
          occurredAt: nowIso(),
        });
      })();
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
      await store.close();
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
function isExecutedAsScript() {
  if (!entryPath) {
    return false;
  }

  // pkg/esbuild CJS bundles
  try {
    if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
      return true;
    }
  } catch {
    // no-op
  }

  // native ESM execution (tsx/node --import etc.)
  try {
    return import.meta.url === new URL(`file://${entryPath}`).href;
  } catch {
    return false;
  }
}

if (isExecutedAsScript()) {
  main().catch((error: unknown) => {
    console.error("[sorisori-pipeline] failed to start", error);
    process.exitCode = 1;
  });
}
