import type { AudioSourceType } from "./audio";
import type { ProviderPair } from "./providers";

export type LanguageCode = "auto" | "en" | "ja" | "zh" | "ko";

export type SessionMode = "realtime" | "quality";

export type SessionLifecycleStatus =
  | "standby"
  | "connecting"
  | "capturing"
  | "transcribing"
  | "translating"
  | "connected"
  | "paused"
  | "completed"
  | "error";

export type SessionArchiveStatus = "draft" | "saved" | "failed";

export interface SessionSourceOption {
  id: string;
  type: AudioSourceType;
  label: string;
  description: string;
  requiresDesktopApp: boolean;
  available: boolean;
}

export interface TranscriptSegment {
  id: string;
  seq: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  translatedText: string;
  isFinal: boolean;
  confidence: number;
}

export interface SessionMetricsSnapshot {
  mode: SessionMode;
  targetLanguage: "ko";
  latencyGoalLabel: string;
  currentLatencyMs: number;
  inputFormatLabel: string;
  providers: ProviderPair;
}

export interface SessionSummary {
  id: string;
  title: string;
  date: string;
  durationLabel: string;
  archiveStatus: SessionArchiveStatus;
  sourceLanguage: Exclude<LanguageCode, "auto">;
  targetLanguage: "ko";
}
