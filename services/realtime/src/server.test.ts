import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { WebSocket, WebSocketServer, type WebSocket as WsSocket } from "ws";

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

interface MockOpenAiServerHandle {
  url: string;
  receivedClientEvents: Array<{ type: string; [key: string]: unknown }>;
  close(): Promise<void>;
}

async function startMockOpenAiRealtimeServer(): Promise<MockOpenAiServerHandle> {
  const httpServer = createServer();
  const websocketServer = new WebSocketServer({ server: httpServer });
  const receivedClientEvents: Array<{ type: string; [key: string]: unknown }> = [];
  let committedSequence = 0;

  websocketServer.on("connection", (socket: WsSocket) => {
    socket.send(JSON.stringify({ type: "session.created", event_id: "session_created_mock" }));

    socket.on("message", (raw) => {
      const payload = JSON.parse(raw.toString()) as { type: string; [key: string]: unknown };
      receivedClientEvents.push(payload);

      if (payload.type === "transcription_session.update") {
        socket.send(
          JSON.stringify({
            type: "transcription_session.updated",
            event_id: "transcription_session_updated_mock",
            session: {
              input_audio_format: "pcm16",
              input_audio_transcription: {
                model: "gpt-4o-mini-transcribe",
              },
            },
          }),
        );
        return;
      }

      if (payload.type === "session.update") {
        socket.send(
          JSON.stringify({
            type: "session.updated",
            event_id: "session_updated_mock",
          }),
        );
        return;
      }

      if (payload.type === "input_audio_buffer.append") {
        committedSequence += 1;
        const itemId = `item_${committedSequence}`;
        socket.send(
          JSON.stringify({
            type: "input_audio_buffer.committed",
            event_id: `committed_${committedSequence}`,
            item_id: itemId,
            previous_item_id: committedSequence > 1 ? `item_${committedSequence - 1}` : null,
          }),
        );
        socket.send(
          JSON.stringify({
            type: "conversation.item.input_audio_transcription.delta",
            event_id: `delta_${committedSequence}`,
            item_id: itemId,
            content_index: 0,
            delta: "hello ",
          }),
        );
        socket.send(
          JSON.stringify({
            type: "conversation.item.input_audio_transcription.completed",
            event_id: `completed_${committedSequence}`,
            item_id: itemId,
            content_index: 0,
            transcript: "hello world",
          }),
        );
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${address.port}`,
    receivedClientEvents,
    async close() {
      await new Promise<void>((resolve, reject) => {
        websocketServer.close((socketError) => {
          if (socketError) {
            reject(socketError);
            return;
          }
          httpServer.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }
            resolve();
          });
        });
      });
    },
  };
}

test("realtime gateway accepts audio uplink flow and forwards transcript events", async (t) => {
  const mockOpenAi = await startMockOpenAiRealtimeServer();
  t.after(async () => {
    await mockOpenAi.close();
  });

  const handle = await startRealtimeGatewayServer({
    port: 0,
    openAiApiKey: "test-openai-key",
    openAiModel: "gpt-4o-mini-transcribe",
    openAiBaseUrl: mockOpenAi.url,
  });
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

  const welcome = await waitForMessage(messages, (message) => message.type === "gateway.welcome");
  assert.equal(welcome.type, "gateway.welcome");

  const providerReady = await waitForMessage(
    messages,
    (message) => message.type === "provider.state" && message.status === "ready",
  );
  assert.equal(providerReady.type, "provider.state");
  assert.equal(providerReady.model, "gpt-4o-mini-transcribe");

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

  const ack = await waitForMessage(messages, (message) => message.type === "audio.chunk.ack");
  assert.equal(ack.type, "audio.chunk.ack");
  assert.equal(ack.chunkIndex, 0);

  const observedMetrics = await waitForMessage(
    messages,
    (message) => message.type === "capture.metrics.observed",
  );
  assert.equal(observedMetrics.type, "capture.metrics.observed");
  assert.equal(observedMetrics.chunkIndex, 0);

  const transcriptDelta = await waitForMessage(
    messages,
    (message) => message.type === "transcription.delta",
  );
  assert.equal(transcriptDelta.type, "transcription.delta");
  assert.equal(transcriptDelta.delta, "hello ");

  const transcriptCompleted = await waitForMessage(
    messages,
    (message) => message.type === "transcription.completed",
  );
  assert.equal(transcriptCompleted.type, "transcription.completed");
  assert.equal(transcriptCompleted.transcript, "hello world");
  assert.equal(transcriptCompleted.sequence, 1);

  socket.send(
    JSON.stringify({
      type: "session.stop",
      sessionId: "session-test-1",
      reason: "test-finished",
      occurredAt: new Date().toISOString(),
    }),
  );

  const completedState = await waitForMessage(
    messages,
    (message) => message.type === "session.state" && message.status === "completed",
  );
  assert.equal(completedState.type, "session.state");
  assert.equal(completedState.sessionId, "session-test-1");

  assert.ok(
    mockOpenAi.receivedClientEvents.some((message) => message.type === "transcription_session.update"),
  );
  assert.ok(
    mockOpenAi.receivedClientEvents.some((message) => message.type === "input_audio_buffer.append"),
  );

  socket.close();
});
