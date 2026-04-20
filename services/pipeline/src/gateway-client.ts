import { setTimeout as delay } from "node:timers/promises";
import { WebSocket, type RawData } from "ws";
import type {
  RealtimeGatewayServerMessage,
  RealtimeSegmentUpsertedMessage,
} from "@sorisori/contracts";

export interface GatewayClientOptions {
  gatewayUrl: string;
  sessionIds: string[];
  clientId: string;
  reconnectDelayMs?: number;
  onSegmentUpserted: (event: RealtimeSegmentUpsertedMessage) => void;
  onLog?: (message: string) => void;
}

const DEFAULT_RECONNECT_DELAY_MS = 3_000;

function nowIso() {
  return new Date().toISOString();
}

export class GatewayClient {
  private readonly options: GatewayClientOptions;
  private readonly reconnectDelayMs: number;
  private websocket: WebSocket | null = null;
  private stopped = false;

  constructor(options: GatewayClientOptions) {
    this.options = options;
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  }

  start() {
    this.stopped = false;
    void this.connectLoop();
  }

  stop() {
    this.stopped = true;
    this.websocket?.close();
    this.websocket = null;
  }

  private log(message: string) {
    this.options.onLog?.(`[pipeline-gateway] ${message}`);
  }

  private async connectLoop() {
    while (!this.stopped) {
      try {
        await this.connect();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Connection failed: ${message}. Retrying in ${this.reconnectDelayMs}ms.`);
      }

      if (!this.stopped) {
        await delay(this.reconnectDelayMs);
      }
    }
  }

  private connect(): Promise<void> {
    return new Promise((resolve) => {
      const ws = new WebSocket(this.options.gatewayUrl);
      this.websocket = ws;

      ws.on("open", () => {
        this.log(`Connected to ${this.options.gatewayUrl}`);

        ws.send(
          JSON.stringify({
            type: "gateway.hello",
            clientId: this.options.clientId,
            role: "pipeline",
            occurredAt: nowIso(),
          }),
        );

        for (const sessionId of this.options.sessionIds) {
          ws.send(
            JSON.stringify({
              type: "session.join",
              sessionId,
              occurredAt: nowIso(),
            }),
          );
          this.log(`Joining session: ${sessionId}`);
        }
      });

      ws.on("message", (raw: RawData) => {
        this.handleMessage(raw);
      });

      ws.on("close", () => {
        this.log("Connection closed.");
        this.websocket = null;
        resolve();
      });

      ws.on("error", (error) => {
        this.log(`WebSocket error: ${error.message}`);
        this.websocket = null;
        resolve();
      });
    });
  }

  private handleMessage(raw: RawData) {
    let payload: RealtimeGatewayServerMessage;
    try {
      payload = JSON.parse(raw.toString()) as RealtimeGatewayServerMessage;
    } catch {
      return;
    }

    if (payload.type === "segment.upserted") {
      this.options.onSegmentUpserted(payload as RealtimeSegmentUpsertedMessage);
    }
  }
}
