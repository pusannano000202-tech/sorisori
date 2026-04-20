export type AudioSourceType = "system-output" | "browser-tab" | "application-feed";

export type AudioEncoding = "pcm16" | "float32";

export interface AudioStreamFormat {
  encoding: AudioEncoding;
  sampleRateHz: number;
  channels: 1 | 2;
}

export interface AudioFormatConversionPlan {
  captureFormatCandidates: AudioStreamFormat[];
  targetFormat: AudioStreamFormat;
  downmixToMono: boolean;
  resampler: "rubato";
  sampleFormatConverter: "dasp";
  chunkDurationMs: number;
}
