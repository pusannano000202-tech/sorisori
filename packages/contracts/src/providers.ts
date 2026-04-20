export type ProviderTransport = "websocket" | "http";

export type TranscriptionProviderId =
  | "openai-realtime-mini"
  | "openai-realtime"
  | "google-stt"
  | "azure-speech-translation";

export type TranslationProviderId =
  | "deepl-text"
  | "google-translate"
  | "azure-speech-translation";

export interface ProviderDescriptor<TProviderId extends string> {
  id: TProviderId;
  label: string;
  transport: ProviderTransport;
  notes: string;
}

export interface ProviderPair {
  transcription: TranscriptionProviderId;
  translation: TranslationProviderId;
}

export const TRANSCRIPTION_PROVIDERS = [
  {
    id: "openai-realtime-mini",
    label: "OpenAI gpt-4o-mini-transcribe",
    transport: "websocket",
    notes: "MVP 기본 실시간 전사 경로",
  },
  {
    id: "openai-realtime",
    label: "OpenAI gpt-4o-transcribe",
    transport: "websocket",
    notes: "품질 우선 모드",
  },
  {
    id: "google-stt",
    label: "Google Speech-to-Text",
    transport: "websocket",
    notes: "비용/운영 비교 후보",
  },
  {
    id: "azure-speech-translation",
    label: "Azure Speech Translation",
    transport: "websocket",
    notes: "통합 모델 대안",
  },
] satisfies ReadonlyArray<ProviderDescriptor<TranscriptionProviderId>>;

export const TRANSLATION_PROVIDERS = [
  {
    id: "deepl-text",
    label: "DeepL Text Translation",
    transport: "http",
    notes: "MVP 기본 한국어 번역 경로",
  },
  {
    id: "google-translate",
    label: "Google Translate",
    transport: "http",
    notes: "비용 비교 후보",
  },
  {
    id: "azure-speech-translation",
    label: "Azure Speech Translation",
    transport: "websocket",
    notes: "통합 번역 대안",
  },
] satisfies ReadonlyArray<ProviderDescriptor<TranslationProviderId>>;

export const MVP_PROVIDER_PAIR = {
  transcription: "openai-realtime-mini",
  translation: "deepl-text",
} satisfies ProviderPair;
