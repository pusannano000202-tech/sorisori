import { setTimeout as delay } from "node:timers/promises";

import { WebSocket, type RawData } from "ws";

import type {
  RealtimeProviderStateMessage,
  RealtimeTranscriptionCompletedMessage,
  RealtimeTranscriptionDeltaMessage,
  RealtimeTranscriptionFailedMessage,
} from "@sorisori/contracts";

type BridgeEvent =
  | RealtimeProviderStateMessage
  | RealtimeTranscriptionDeltaMessage
  | RealtimeTranscriptionCompletedMessage
  | RealtimeTranscriptionFailedMessage;

type SessionUpdateMode = "transcription_session.update" | "session.update";

interface OpenAiCommittedItem {
  itemId: string;
  previousItemId: string | null;
  sequence: number;
}

export interface OpenAiRealtimeTranscriptionBridgeOptions {
  sessionId: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  language?: string;
  prompt?: string;
  connectTimeoutMs?: number;
  onEvent: (event: BridgeEvent) => void;
}

interface OpenAiRealtimeServerEvent {
  type: string;
  [key: string]: unknown;
}

const DEFAULT_BASE_URL = "wss://api.openai.com/v1/realtime";
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const MAX_PENDING_AUDIO_EVENTS = 250;

function nowIso() {
  return new Date().toISOString();
}

function extractErrorMessage(event: OpenAiRealtimeServerEvent): string {
  const errorValue = event.error;
  if (errorValue && typeof errorValue === "object") {
    const typedError = errorValue as { message?: unknown; code?: unknown; type?: unknown };
    const message = typeof typedError.message === "string" ? typedError.message : null;
    const code = typeof typedError.code === "string" ? typedError.code : null;
    const type = typeof typedError.type === "string" ? typedError.type : null;
    return [type, code, message].filter(Boolean).join(": ");
  }

  if (typeof event.message === "string") {
    return event.message;
  }

  return "OpenAI Realtime API returned an unknown error.";
}

function shouldFallbackToSessionUpdate(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("transcription_session.update") ||
    normalized.includes("unknown event") ||
    normalized.includes("unsupported event") ||
    normalized.includes("invalid event")
  );
}

function parseEvent(raw: RawData): OpenAiRealtimeServerEvent | null {
  try {
    const payload = JSON.parse(raw.toString()) as OpenAiRealtimeServerEvent;
    if (!payload || typeof payload.type !== "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export class OpenAiRealtimeTranscriptionBridge {
  private readonly options: OpenAiRealtimeTranscriptionBridgeOptions;
  private readonly pendingAudioEvents: string[] = [];
  private readonly committedItems = new Map<string, OpenAiCommittedItem>();
  private readonly connectTimeoutMs: number;
  private websocket: WebSocket | null = null;
  private ready = false;
  private closed = false;
  private sessionUpdateMode: SessionUpdateMode = "transcription_session.update";
  private nextSequence = 0;

  constructor(options: OpenAiRealtimeTranscriptionBridgeOptions) {
    this.options = options;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  }

  async connect() {
    if (this.websocket) {
      return;
    }

    this.emitProviderState("connecting", "Connecting to OpenAI Realtime transcription.");

    const baseUrl = this.options.baseUrl ?? DEFAULT_BASE_URL;
    const url = new URL(baseUrl);
    if (!url.searchParams.has("model")) {
      url.searchParams.set("model", this.options.model);
    }

    const websocket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
      },
    });
    this.websocket = websocket;

    websocket.on("open", () => {
      this.sendSessionConfiguration();
    });

    websocket.on("message", (raw) => {
      const event = parseEvent(raw);
      if (!event) {
        this.emitProviderState("error", "Received non-JSON payload from OpenAI Realtime.");
        return;
      }
      this.handleServerEvent(event);
    });

    websocket.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer.toString();
      this.websocket = null;
      this.ready = false;
      this.closed = true;
      this.emitProviderState(
        "closed",
        `OpenAI Realtime connection closed (${code}${reason ? `: ${reason}` : ""}).`,
      );
    });

    websocket.on("error", (error) => {
      this.emitProviderState("error", error.message);
    });

    await Promise.race([
      onceWebSocketOpen(websocket),
      delay(this.connectTimeoutMs).then(() => {
        throw new Error("Timed out while connecting to OpenAI Realtime.");
      }),
    ]);
  }

  appendAudioChunk(pcm16Base64: string) {
    if (this.closed) {
      return false;
    }

    const serialized = JSON.stringify({
      type: "input_audio_buffer.append",
      audio: pcm16Base64,
    });

    if (this.websocket?.readyState === WebSocket.OPEN && this.ready) {
      this.websocket.send(serialized);
      return true;
    }

    if (this.pendingAudioEvents.length >= MAX_PENDING_AUDIO_EVENTS) {
      this.pendingAudioEvents.shift();
    }
    this.pendingAudioEvents.push(serialized);
    return false;
  }

  close() {
    this.closed = true;
    this.ready = false;
    this.pendingAudioEvents.length = 0;

    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
    } else if (this.websocket) {
      this.websocket.terminate();
    }
    this.websocket = null;
  }

  private handleServerEvent(event: OpenAiRealtimeServerEvent) {
    switch (event.type) {
      case "session.created":
        return;
      case "session.updated":
      case "transcription_session.updated":
        this.ready = true;
        this.emitProviderState("ready", `OpenAI Realtime transcription is ready with model ${this.options.model}.`);
        this.flushPendingAudioEvents();
        return;
      case "input_audio_buffer.committed": {
        const itemId = typeof event.item_id === "string" ? event.item_id : null;
        if (!itemId) {
          return;
        }
        const previousItemId =
          typeof event.previous_item_id === "string" ? event.previous_item_id : null;
        this.nextSequence += 1;
        this.committedItems.set(itemId, {
          itemId,
          previousItemId,
          sequence: this.nextSequence,
        });
        return;
      }
      case "conversation.item.input_audio_transcription.delta": {
        const itemId = typeof event.item_id === "string" ? event.item_id : null;
        const contentIndex =
          typeof event.content_index === "number" ? event.content_index : 0;
        const delta = typeof event.delta === "string" ? event.delta : "";
        if (!itemId) {
          return;
        }
        const committedItem = this.committedItems.get(itemId);
        this.options.onEvent({
          type: "transcription.delta",
          sessionId: this.options.sessionId,
          itemId,
          contentIndex,
          delta,
          sequence: committedItem?.sequence ?? null,
          previousItemId: committedItem?.previousItemId ?? null,
          occurredAt: nowIso(),
        });
        return;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const itemId = typeof event.item_id === "string" ? event.item_id : null;
        const contentIndex =
          typeof event.content_index === "number" ? event.content_index : 0;
        const transcript = typeof event.transcript === "string" ? event.transcript : "";
        if (!itemId) {
          return;
        }
        const committedItem = this.committedItems.get(itemId);
        this.options.onEvent({
          type: "transcription.completed",
          sessionId: this.options.sessionId,
          itemId,
          contentIndex,
          transcript,
          sequence: committedItem?.sequence ?? null,
          previousItemId: committedItem?.previousItemId ?? null,
          occurredAt: nowIso(),
        });
        return;
      }
      case "conversation.item.input_audio_transcription.failed": {
        const itemId = typeof event.item_id === "string" ? event.item_id : "unknown-item";
        const contentIndex =
          typeof event.content_index === "number" ? event.content_index : 0;
        const errorMessage = extractErrorMessage(event);
        const committedItem = this.committedItems.get(itemId);
        this.options.onEvent({
          type: "transcription.failed",
          sessionId: this.options.sessionId,
          itemId,
          contentIndex,
          errorMessage,
          sequence: committedItem?.sequence ?? null,
          previousItemId: committedItem?.previousItemId ?? null,
          occurredAt: nowIso(),
        });
        return;
      }
      case "error": {
        const errorMessage = extractErrorMessage(event);
        if (
          !this.ready &&
          this.sessionUpdateMode === "transcription_session.update" &&
          shouldFallbackToSessionUpdate(errorMessage)
        ) {
          this.sessionUpdateMode = "session.update";
          this.emitProviderState(
            "connecting",
            "OpenAI Realtime rejected transcription_session.update, retrying with session.update.",
          );
          this.sendSessionConfiguration();
          return;
        }

        this.emitProviderState("error", errorMessage);
        return;
      }
      default:
        return;
    }
  }

  private sendSessionConfiguration() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const primaryConfig = {
      type: "transcription_session.update",
      session: {
        input_audio_format: "pcm16",
        input_audio_transcription: {
          model: this.options.model,
          ...(this.options.language ? { language: this.options.language } : {}),
          ...(this.options.prompt ? { prompt: this.options.prompt } : {}),
        },
        input_audio_noise_reduction: null,
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    };

    const fallbackConfig = {
      type: "session.update",
      session: {
        type: "transcription",
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000,
            },
            noise_reduction: null,
            transcription: {
              model: this.options.model,
              ...(this.options.language ? { language: this.options.language } : {}),
              ...(this.options.prompt ? { prompt: this.options.prompt } : {}),
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        },
      },
    };

    const payload =
      this.sessionUpdateMode === "transcription_session.update"
        ? primaryConfig
        : fallbackConfig;

    this.websocket.send(JSON.stringify(payload));
  }

  private flushPendingAudioEvents() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN || !this.ready) {
      return;
    }

    while (this.pendingAudioEvents.length > 0) {
      const nextPayload = this.pendingAudioEvents.shift();
      if (nextPayload) {
        this.websocket.send(nextPayload);
      }
    }
  }

  private emitProviderState(
    status: RealtimeProviderStateMessage["status"],
    message: string,
  ) {
    this.options.onEvent({
      type: "provider.state",
      sessionId: this.options.sessionId,
      provider: "openai-realtime-transcription",
      status,
      model: this.options.model,
      message,
      occurredAt: nowIso(),
    });
  }
}

function onceWebSocketOpen(websocket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    if (websocket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    const cleanup = () => {
      websocket.off("open", handleOpen);
      websocket.off("error", handleError);
    };

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    websocket.once("open", handleOpen);
    websocket.once("error", handleError);
  });
}
