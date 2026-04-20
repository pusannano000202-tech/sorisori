import type { AudioFormatConversionPlan, AudioStreamFormat } from "./audio";
import type { SessionMetricsSnapshot, SessionSourceOption } from "./session";

import { MVP_PROVIDER_PAIR } from "./providers";

export const WINDOWS_WASAPI_CAPTURE_FORMATS = [
  {
    encoding: "float32",
    sampleRateHz: 44100,
    channels: 2,
  },
  {
    encoding: "float32",
    sampleRateHz: 48000,
    channels: 2,
  },
] satisfies ReadonlyArray<AudioStreamFormat>;

export const OPENAI_REALTIME_INPUT_FORMAT = {
  encoding: "pcm16",
  sampleRateHz: 24000,
  channels: 1,
} satisfies AudioStreamFormat;

export const MVP_AUDIO_CONVERSION_PLAN = {
  captureFormatCandidates: WINDOWS_WASAPI_CAPTURE_FORMATS,
  targetFormat: OPENAI_REALTIME_INPUT_FORMAT,
  downmixToMono: true,
  resampler: "rubato",
  sampleFormatConverter: "dasp",
  chunkDurationMs: 120,
} satisfies AudioFormatConversionPlan;

export const DEFAULT_SESSION_SOURCES = [
  {
    id: "system-output",
    type: "system-output",
    label: "System output",
    description: "Windows loopback으로 컴퓨터 전체 출력 오디오를 캡처합니다.",
    requiresDesktopApp: true,
    available: true,
  },
  {
    id: "browser-tab",
    type: "browser-tab",
    label: "Browser tab",
    description: "브라우저 탭 오디오를 선택해 웹 기반으로 세션을 시작합니다.",
    requiresDesktopApp: false,
    available: true,
  },
  {
    id: "application-feed",
    type: "application-feed",
    label: "App-specific feed",
    description: "향후 특정 앱별 라우팅을 위한 확장 자리입니다.",
    requiresDesktopApp: true,
    available: false,
  },
] satisfies ReadonlyArray<SessionSourceOption>;

export const MVP_SESSION_METRICS = {
  mode: "realtime",
  targetLanguage: "ko",
  latencyGoalLabel: "2-4s",
  currentLatencyMs: 2100,
  inputFormatLabel: "PCM16 / 24kHz / mono",
  providers: MVP_PROVIDER_PAIR,
} satisfies SessionMetricsSnapshot;
