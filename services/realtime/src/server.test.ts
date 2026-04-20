import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { WebSocket } from "ws";

import type { RealtimeGatewayServerMessage } from "@sorisori/contracts";

import { startRealtimeGatewayServer } from "./server.js";

async function waitForMessage<T>(
  collector: T[],
  predicate: (message: T) => boolean,
  timeoutMs = 2000,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const found = collector.find(predicate);
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out while waiting for expected websocket message.");
}

test("realtime gateway accepts audio uplink flow and exposes health", async (t) => {
  const handle = await startRealtimeGatewayServer({ port: 0 });
  t.after(async () => {
    await handle.close();
  });

  const healthResponse = await fetch(`http://${handle.host}:${handle.port}/health`);
  assert.equal(healthResponse.status, 200);
  const healthPayload = (await healthResponse.json()) as {
    status: string;
    activeConnections: number;
  };
  assert.equal(healthPayload.status, "ok");

  const socket = new WebSocket(`ws://${handle.host}:${handle.port}/ws`);
  const messages: RealtimeGatewayServerMessage[] = [];

  socket.on("message", (raw) => {
    messages.push(JSON.parse(raw.toString()) as RealtimeGatewayServerMessage);
  });

  await once(socket, "open");

  socket.send(
    JSON.stringify({
      type: "gateway.hello",
      clientId: "desktop-test-client",
      role: "desktop-capture",
      occurredAt: new Date().toISOString(),
    }),
  );
  socket.send(
    JSON.stringify({
      type: "session.start",
      sessionId: "session-test-1",
      sourceType: "system-output",
      sourceLabel: "Desktop loopback",
      sourceFormat: {
        encoding: "pcm16",
        sampleRateHz: 24_000,
        channels: 1,
      },
      targetFormat: {
        encoding: "pcm16",
        sampleRateHz: 24_000,
        channels: 1,
      },
      chunkDurationMs: 20,
      targetLanguage: "ko",
      occurredAt: new Date().toISOString(),
    }),
  );
  socket.send(
    JSON.stringify({
      type: "audio.chunk.append",
      sessionId: "session-test-1",
      chunkIndex: 0,
      pcm16Base64: Buffer.alloc(960, 0).toString("base64"),
      frameCount: 480,
      sampleRateHz: 24_000,
      durationMs: 20,
      peakLevel: 0,
      timestampMs: 0,
      occurredAt: new Date().toISOString(),
    }),
  );
  socket.send(
    JSON.stringify({
      type: "capture.metrics",
      sessionId: "session-test-1",
      chunkIndex: 0,
      inputFrames: 960,
      outputFrames: 480,
      peakLevel: 0.12,
      silent: false,
      dataDiscontinuity: false,
      sourceSampleRateHz: 48_000,
      chunkTimestampMs: 0,
      occurredAt: new Date().toISOString(),
    }),
  );
  socket.send(
    JSON.stringify({
      type: "session.stop",
      sessionId: "session-test-1",
      reason: "test-finished",
      occurredAt: new Date().toISOString(),
    }),
  );

  const welcome = await waitForMessage(messages, (message) => message.type === "gateway.welcome");
  assert.equal(welcome.type, "gateway.welcome");

  const ack = await waitForMessage(messages, (message) => message.type === "audio.chunk.ack");
  assert.equal(ack.type, "audio.chunk.ack");
  assert.equal(ack.chunkIndex, 0);

  const completedState = await waitForMessage(
    messages,
    (message) => message.type === "session.state" && message.status === "completed",
  );
  assert.equal(completedState.type, "session.state");
  assert.equal(completedState.sessionId, "session-test-1");

  const observedMetrics = await waitForMessage(
    messages,
    (message) => message.type === "capture.metrics.observed",
  );
  assert.equal(observedMetrics.type, "capture.metrics.observed");
  assert.equal(observedMetrics.chunkIndex, 0);

  socket.close();
});
