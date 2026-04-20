import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import {
  WebSocket,
  WebSocketServer,
  type RawData,
  type WebSocket as WsSocket,
} from "ws";

import type {
  GatewayErrorMessage,
  GatewayHelloMessage,
  GatewayPongMessage,
  GatewayWelcomeMessage,
  RealtimeAudioChunkAckMessage,
  RealtimeAudioChunkAppendMessage,
  RealtimeCaptureMetricsMessage,
  RealtimeCaptureMetricsObservedMessage,
  RealtimeClientRole,
  RealtimeGatewayClientMessage,
  RealtimeGatewayServerMessage,
  RealtimePingMessage,
  RealtimeSessionStartMessage,
  RealtimeSessionStateMessage,
  RealtimeSessionStopMessage,
  SessionLifecycleStatus,
} from "@sorisori/contracts";

interface ClientConnection {
  connectionId: string;
  socket: WsSocket;
  role: RealtimeClientRole | null;
  sessionId: string | null;
}

interface SessionRecord {
  sessionId: string;
  status: SessionLifecycleStatus;
  sourceType: RealtimeSessionStartMessage["sourceType"];
  sourceLabel: string;
  targetLanguage: "ko";
  sourceFormat: RealtimeSessionStartMessage["sourceFormat"];
  targetFormat: RealtimeSessionStartMessage["targetFormat"];
  chunkDurationMs: number;
  connectedClientIds: Set<string>;
  totalAudioChunks: number;
  totalAudioBytes: number;
  latestChunkIndex: number | null;
  lastMetrics: RealtimeCaptureMetricsMessage | null;
  updatedAt: string;
}

export interface RealtimeGatewayServerHandle {
  host: string;
  port: number;
  httpServer: HttpServer;
  close(): Promise<void>;
}

interface StartRealtimeGatewayOptions {
  host?: string;
  port?: number;
}

function nowIso() {
  return new Date().toISOString();
}

function toJson(payload: RealtimeGatewayServerMessage) {
  return JSON.stringify(payload);
}

function parseJsonMessage(raw: RawData): RealtimeGatewayClientMessage | null {
  try {
    const parsed = JSON.parse(raw.toString()) as RealtimeGatewayClientMessage;
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildWelcome(connectionId: string): GatewayWelcomeMessage {
  return {
    type: "gateway.welcome",
    connectionId,
    acceptedRoles: ["desktop-capture", "web-viewer", "pipeline"],
    occurredAt: nowIso(),
  };
}

function buildPong(): GatewayPongMessage {
  return {
    type: "gateway.pong",
    occurredAt: nowIso(),
  };
}

function buildError(message: string, recoverable = true, sessionId?: string): GatewayErrorMessage {
  return {
    type: "gateway.error",
    message,
    recoverable,
    sessionId,
    occurredAt: nowIso(),
  };
}

function buildSessionState(session: SessionRecord): RealtimeSessionStateMessage {
  return {
    type: "session.state",
    sessionId: session.sessionId,
    status: session.status,
    connectedClients: session.connectedClientIds.size,
    totalAudioChunks: session.totalAudioChunks,
    latestChunkIndex: session.latestChunkIndex,
    occurredAt: nowIso(),
  };
}

function safeSend(socket: WsSocket, payload: RealtimeGatewayServerMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(toJson(payload));
  }
}

function createHealthPayload(
  clients: Map<string, ClientConnection>,
  sessions: Map<string, SessionRecord>,
) {
  return {
    status: "ok",
    service: "sorisori-realtime",
    activeConnections: clients.size,
    activeSessions: Array.from(sessions.values()).map((session) => ({
      sessionId: session.sessionId,
      status: session.status,
      connectedClients: session.connectedClientIds.size,
      totalAudioChunks: session.totalAudioChunks,
      latestChunkIndex: session.latestChunkIndex,
      updatedAt: session.updatedAt,
    })),
    occurredAt: nowIso(),
  };
}

export async function startRealtimeGatewayServer(
  options: StartRealtimeGatewayOptions = {},
): Promise<RealtimeGatewayServerHandle> {
  const host = options.host ?? process.env.REALTIME_HOST ?? "127.0.0.1";
  const requestedPort = options.port ?? Number(process.env.REALTIME_PORT ?? "8787");

  const clients = new Map<string, ClientConnection>();
  const sessions = new Map<string, SessionRecord>();

  const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(createHealthPayload(clients, sessions), null, 2));
      return;
    }

    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify(
        {
          status: "not-found",
          message: "Use /health for health checks or connect to /ws for realtime uplink.",
          occurredAt: nowIso(),
        },
        null,
        2,
      ),
    );
  });

  const websocketServer = new WebSocketServer({ noServer: true });

  function broadcastToSession(sessionId: string, payload: RealtimeGatewayServerMessage) {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    for (const connectionId of session.connectedClientIds) {
      const client = clients.get(connectionId);
      if (client) {
        safeSend(client.socket, payload);
      }
    }
  }

  function upsertSession(payload: RealtimeSessionStartMessage): SessionRecord {
    const existing = sessions.get(payload.sessionId);
    const nextSession: SessionRecord = existing ?? {
      sessionId: payload.sessionId,
      status: "standby",
      sourceType: payload.sourceType,
      sourceLabel: payload.sourceLabel,
      targetLanguage: payload.targetLanguage,
      sourceFormat: payload.sourceFormat,
      targetFormat: payload.targetFormat,
      chunkDurationMs: payload.chunkDurationMs,
      connectedClientIds: new Set<string>(),
      totalAudioChunks: 0,
      totalAudioBytes: 0,
      latestChunkIndex: null,
      lastMetrics: null,
      updatedAt: nowIso(),
    };

    nextSession.status = "connecting";
    nextSession.sourceType = payload.sourceType;
    nextSession.sourceLabel = payload.sourceLabel;
    nextSession.sourceFormat = payload.sourceFormat;
    nextSession.targetFormat = payload.targetFormat;
    nextSession.chunkDurationMs = payload.chunkDurationMs;
    nextSession.updatedAt = nowIso();
    sessions.set(payload.sessionId, nextSession);
    return nextSession;
  }

  function handleClientDisconnect(connectionId: string) {
    const client = clients.get(connectionId);
    if (!client) {
      return;
    }

    clients.delete(connectionId);
    if (!client.sessionId) {
      return;
    }

    const session = sessions.get(client.sessionId);
    if (!session) {
      return;
    }

    session.connectedClientIds.delete(connectionId);
    if (session.connectedClientIds.size === 0 && session.status !== "completed") {
      session.status = "paused";
    }
    session.updatedAt = nowIso();
    broadcastToSession(session.sessionId, buildSessionState(session));
  }

  function ensureSession(
    sessionId: string,
    socket: WsSocket,
  ): SessionRecord | undefined {
    const session = sessions.get(sessionId);
    if (!session) {
      safeSend(socket, buildError("Session is not started yet.", true, sessionId));
      return undefined;
    }
    return session;
  }

  function handleMessage(connectionId: string, socket: WsSocket, payload: RealtimeGatewayClientMessage) {
    const client = clients.get(connectionId);
    if (!client) {
      return;
    }

    switch (payload.type) {
      case "gateway.hello": {
        const hello = payload as GatewayHelloMessage;
        client.role = hello.role;
        return;
      }
      case "gateway.ping": {
        const _ping = payload as RealtimePingMessage;
        safeSend(socket, buildPong());
        return;
      }
      case "session.start": {
        const startPayload = payload as RealtimeSessionStartMessage;
        client.sessionId = startPayload.sessionId;
        const session = upsertSession(startPayload);
        session.connectedClientIds.add(connectionId);
        session.updatedAt = nowIso();
        broadcastToSession(session.sessionId, buildSessionState(session));
        return;
      }
      case "audio.chunk.append": {
        const chunkPayload = payload as RealtimeAudioChunkAppendMessage;
        const session = ensureSession(chunkPayload.sessionId, socket);
        if (!session) {
          return;
        }

        const pcm16Bytes = Buffer.from(chunkPayload.pcm16Base64, "base64");
        if (pcm16Bytes.length !== chunkPayload.frameCount * 2) {
          safeSend(
            socket,
            buildError(
              `Chunk ${chunkPayload.chunkIndex} byte length ${pcm16Bytes.length} did not match frameCount ${chunkPayload.frameCount}.`,
              false,
              chunkPayload.sessionId,
            ),
          );
          return;
        }

        session.status = "capturing";
        session.totalAudioChunks += 1;
        session.totalAudioBytes += pcm16Bytes.length;
        session.latestChunkIndex = chunkPayload.chunkIndex;
        session.updatedAt = nowIso();

        const ackPayload: RealtimeAudioChunkAckMessage = {
          type: "audio.chunk.ack",
          sessionId: session.sessionId,
          chunkIndex: chunkPayload.chunkIndex,
          totalAudioChunks: session.totalAudioChunks,
          totalAudioBytes: session.totalAudioBytes,
          occurredAt: nowIso(),
        };
        safeSend(socket, ackPayload);

        if (chunkPayload.chunkIndex === 0 || session.totalAudioChunks % 25 === 0) {
          broadcastToSession(session.sessionId, buildSessionState(session));
        }
        return;
      }
      case "capture.metrics": {
        const metricsPayload = payload as RealtimeCaptureMetricsMessage;
        const session = ensureSession(metricsPayload.sessionId, socket);
        if (!session) {
          return;
        }

        session.lastMetrics = metricsPayload;
        session.updatedAt = nowIso();
        const observedPayload: RealtimeCaptureMetricsObservedMessage = {
          type: "capture.metrics.observed",
          sessionId: session.sessionId,
          chunkIndex: metricsPayload.chunkIndex,
          peakLevel: metricsPayload.peakLevel,
          silent: metricsPayload.silent,
          dataDiscontinuity: metricsPayload.dataDiscontinuity,
          occurredAt: nowIso(),
        };
        broadcastToSession(session.sessionId, observedPayload);
        return;
      }
      case "session.stop": {
        const stopPayload = payload as RealtimeSessionStopMessage;
        const session = ensureSession(stopPayload.sessionId, socket);
        if (!session) {
          return;
        }

        session.status = "completed";
        session.updatedAt = nowIso();
        broadcastToSession(session.sessionId, buildSessionState(session));
        return;
      }
      default: {
        safeSend(socket, buildError(`Unsupported message type: ${(payload as { type: string }).type}`));
      }
    }
  }

  websocketServer.on("connection", (socket: WsSocket, _request: IncomingMessage) => {
    const connectionId = randomUUID();
    clients.set(connectionId, {
      connectionId,
      socket,
      role: null,
      sessionId: null,
    });

    safeSend(socket, buildWelcome(connectionId));

    socket.on("message", (raw) => {
      const payload = parseJsonMessage(raw);
      if (!payload) {
        safeSend(socket, buildError("Payload was not valid JSON.", false));
        return;
      }
      handleMessage(connectionId, socket, payload);
    });

    socket.on("close", () => {
      handleClientDisconnect(connectionId);
    });

    socket.on("error", () => {
      handleClientDisconnect(connectionId);
    });
  });

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (upgradedSocket) => {
      websocketServer.emit("connection", upgradedSocket, request);
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

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve realtime gateway address.");
  }

  return {
    host,
    port: (address as AddressInfo).port,
    httpServer,
    async close() {
      for (const client of clients.values()) {
        client.socket.close();
      }

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

async function main() {
  const handle = await startRealtimeGatewayServer();
  console.log(
    `[sorisori-realtime] listening on http://${handle.host}:${handle.port} (ws: /ws, health: /health)`,
  );
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === new URL(`file://${entryPath}`).href) {
  main().catch((error: unknown) => {
    console.error("[sorisori-realtime] failed to start", error);
    process.exitCode = 1;
  });
}
