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

export interface LocalTranscriptionBridgeOptions {
  sessionId: string;
  baseUrl: string;
  language?: string;
  onEvent: (event: BridgeEvent) => void;
}

interface LocalTranscribeResponse {
  transcript?: string;
}

// PCM16 mono 24kHz: RMS below this value is treated as silence.
const SILENCE_RMS_THRESHOLD = 80;
// Consecutive silent chunks (~20ms each) before flushing speech buffer.
const SILENCE_CHUNKS_REQUIRED = 14; // ~280ms of silence
// Minimum buffered speech chunks before a flush is worthwhile.
const MIN_SPEECH_CHUNKS = 20; // ~400ms minimum context for Whisper
// Force flush when this many speech chunks accumulate (~3 seconds max batch).
const MAX_SPEECH_CHUNKS = 150;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

function computeRms(pcm16: Buffer): number {
  if (pcm16.length < 2) {
    return 0;
  }
  let sumSq = 0;
  const sampleCount = Math.floor(pcm16.length / 2);
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcm16.readInt16LE(i * 2);
    sumSq += sample * sample;
  }
  return Math.sqrt(sumSq / sampleCount);
}

function nowIso() {
  return new Date().toISOString();
}

export class LocalTranscriptionBridge {
  private readonly options: LocalTranscriptionBridgeOptions;
  private readonly audioBuffer: Buffer[] = [];
  private silenceChunks = 0;
  private itemCounter = 0;
  private sequence = 0;
  private previousItemId: string | null = null;
  private closed = false;
  private flushInProgress = false;

  constructor(options: LocalTranscriptionBridgeOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(`${this.options.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`local-ai health check returned ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "local-ai health check failed";
      this.emitProviderState("error", `Cannot reach local-ai service: ${message}`);
      throw error;
    }

    this.emitProviderState("ready", `Local AI transcription ready (${this.options.baseUrl}).`);
  }

  appendAudioChunk(pcm16Base64: string): boolean {
    if (this.closed) {
      return false;
    }

    const chunk = Buffer.from(pcm16Base64, "base64");
    const rms = computeRms(chunk);

    if (rms < SILENCE_RMS_THRESHOLD) {
      this.silenceChunks++;
      if (
        this.silenceChunks >= SILENCE_CHUNKS_REQUIRED &&
        this.audioBuffer.length >= MIN_SPEECH_CHUNKS &&
        !this.flushInProgress
      ) {
        void this.flushBuffer();
      }
    } else {
      this.silenceChunks = 0;
      this.audioBuffer.push(chunk);
      if (this.audioBuffer.length >= MAX_SPEECH_CHUNKS && !this.flushInProgress) {
        void this.flushBuffer();
      }
    }

    return true;
  }

  close(): void {
    this.closed = true;
    if (this.audioBuffer.length >= MIN_SPEECH_CHUNKS && !this.flushInProgress) {
      void this.flushBuffer();
    }
    this.audioBuffer.length = 0;
  }

  private async flushBuffer(): Promise<void> {
    if (this.audioBuffer.length === 0) {
      return;
    }

    this.flushInProgress = true;
    const combined = Buffer.concat(this.audioBuffer);
    this.audioBuffer.length = 0;
    this.silenceChunks = 0;

    this.itemCounter += 1;
    this.sequence += 1;
    const itemId = `local-item-${this.itemCounter}`;
    const contentIndex = 0;
    const previousItemId = this.previousItemId;
    const seq = this.sequence;

    this.options.onEvent({
      type: "transcription.delta",
      sessionId: this.options.sessionId,
      itemId,
      contentIndex,
      delta: "",
      sequence: seq,
      previousItemId,
      occurredAt: nowIso(),
    });

    try {
      const transcript = await this.callTranscribe(combined);

      if (this.closed && !transcript) {
        return;
      }

      this.options.onEvent({
        type: "transcription.completed",
        sessionId: this.options.sessionId,
        itemId,
        contentIndex,
        transcript: transcript ?? "",
        sequence: seq,
        previousItemId,
        occurredAt: nowIso(),
      });

      this.previousItemId = itemId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Local transcription failed.";
      this.options.onEvent({
        type: "transcription.failed",
        sessionId: this.options.sessionId,
        itemId,
        contentIndex,
        errorMessage,
        sequence: seq,
        previousItemId,
        occurredAt: nowIso(),
      });
    } finally {
      this.flushInProgress = false;
    }
  }

  private async callTranscribe(pcm16: Buffer): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.options.baseUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_base64: pcm16.toString("base64"),
          language: this.options.language ?? null,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`/transcribe returned ${response.status}`);
      }

      const data = (await response.json()) as LocalTranscribeResponse;
      return data.transcript ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  private emitProviderState(
    status: RealtimeProviderStateMessage["status"],
    message: string,
  ): void {
    this.options.onEvent({
      type: "provider.state",
      sessionId: this.options.sessionId,
      provider: "local-ai-transcription",
      status,
      model: "faster-whisper",
      message,
      occurredAt: nowIso(),
    });
  }
}
