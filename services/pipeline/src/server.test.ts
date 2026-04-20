import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { WebSocket, WebSocketServer, type WebSocket as WsSocket } from "ws";

import { startPipelineServer } from "./server.js";
import type { TranscriptSegment } from "@sorisori/contracts";

async function startMockGateway(): Promise<{
  url: string;
  broadcast: (payload: unknown) => void;
  close: () => Promise<void>;
}> {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });
  const sockets = new Set<WsSocket>();

  wss.on("connection", (ws: WsSocket) => {
    sockets.add(ws);
    ws.on("close", () => sockets.delete(ws));

    ws.send(JSON.stringify({ type: "gateway.welcome", connectionId: "mock-conn", acceptedRoles: ["pipeline"], occurredAt: new Date().toISOString() }));
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const { port } = httpServer.address() as AddressInfo;

  return {
    url: `ws://127.0.0.1:${port}/ws`,
    broadcast(payload) {
      const data = JSON.stringify(payload);
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      }
    },
    close() {
      return new Promise<void>((resolve) => {
        for (const ws of sockets) ws.close();
        httpServer.close(() => resolve());
      });
    },
  };
}

async function waitFor<T>(
  getter: () => T | undefined,
  timeoutMs = 2_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = getter();
    if (result !== undefined) return result;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("waitFor timed out");
}

test("pipeline server stores segment.upserted and exposes REST endpoints", async () => {
  const gateway = await startMockGateway();

  const pipeline = await startPipelineServer({
    gatewayUrl: gateway.url,
    sessionIds: ["test-session"],
    port: 0,
  });

  const baseUrl = `http://127.0.0.1:${pipeline.port}`;

  // Wait for pipeline WS to connect to mock gateway
  await new Promise((r) => setTimeout(r, 200));

  const segment: TranscriptSegment = {
    id: "item-001",
    seq: 1,
    startMs: 0,
    endMs: 3000,
    sourceText: "Hello world",
    translatedText: "안녕 세계",
    isFinal: true,
    confidence: 1.0,
  };

  gateway.broadcast({
    type: "segment.upserted",
    sessionId: "test-session",
    segment,
    occurredAt: new Date().toISOString(),
  });

  // Wait for segment to be stored
  await waitFor(() => {
    const sessions = fetch(`${baseUrl}/sessions`);
    return sessions;
  });
  await new Promise((r) => setTimeout(r, 100));

  // /health
  const healthRes = await fetch(`${baseUrl}/health`);
  const health = await healthRes.json() as { status: string; trackedSegments: number };
  assert.equal(health.status, "ok");
  assert.equal(health.trackedSegments, 1);

  // /sessions
  const sessionsRes = await fetch(`${baseUrl}/sessions`);
  const sessions = await sessionsRes.json() as { sessions: Array<{ sessionId: string }> };
  assert.equal(sessions.sessions.length, 1);
  assert.equal(sessions.sessions[0].sessionId, "test-session");

  // /sessions/:id/segments
  const segmentsRes = await fetch(`${baseUrl}/sessions/test-session/segments`);
  const segmentsBody = await segmentsRes.json() as { segments: TranscriptSegment[] };
  assert.equal(segmentsBody.segments.length, 1);
  assert.equal(segmentsBody.segments[0].id, "item-001");
  assert.equal(segmentsBody.segments[0].translatedText, "안녕 세계");

  // /sessions/:id/summary
  const summaryRes = await fetch(`${baseUrl}/sessions/test-session/summary`);
  const summary = await summaryRes.json() as { sourceText: string; translatedText: string };
  assert.equal(summary.sourceText, "Hello world");
  assert.equal(summary.translatedText, "안녕 세계");

  // 404 for unknown session
  const notFoundRes = await fetch(`${baseUrl}/sessions/no-such-session/segments`);
  assert.equal(notFoundRes.status, 404);

  await pipeline.close();
  await gateway.close();
});
