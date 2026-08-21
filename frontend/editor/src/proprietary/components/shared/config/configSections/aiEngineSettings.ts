// Shared types + constants for the aiEngine admin settings section.
// All four sub-pages share one GET /section/aiEngine payload; each saves only its own keys so siblings survive.

/** Secret fields come back masked as this literal when a value is set. */
export const MASKED_SECRET = "********";

/** Clamp a numeric setting to a safe integer at submit; a persisted 0 timeout/concurrency would deadlock the engine (Mantine's min only guards on blur). */
export const clampMin = (value: unknown, min: number): number =>
  Math.max(min, Math.floor(Number(value) || min));

export interface AiEngineModels {
  provider?: string;
  smartModel?: string;
  fastModel?: string;
  smartMaxTokens?: number;
  fastMaxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface AiEngineRag {
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingApiKey?: string;
  embeddingBaseUrl?: string;
  topK?: number;
  maxSearches?: number;
}

export interface AiEngineLimits {
  maxPages?: number;
  maxCharacters?: number;
  modelMaxConcurrency?: number;
}

export interface AiEngineFeatures {
  chat?: boolean;
  documentQuestions?: boolean;
  createPdf?: boolean;
  mathAuditor?: boolean;
  pdfComment?: boolean;
  classify?: boolean;
}

export interface AiEngineSettingsData {
  enabled?: boolean;
  url?: string;
  /**
   * Whether the processor forwards settings to the engine; SaaS pins it false, so a save
   * persists but never reaches the engine (the toast must say so, not promise a live push).
   */
  pushConfigToEngine?: boolean;
  timeoutSeconds?: number;
  longRunningTimeoutSeconds?: number;
  streamTimeoutSeconds?: number;
  models?: AiEngineModels;
  rag?: AiEngineRag;
  limits?: AiEngineLimits;
  features?: AiEngineFeatures;
}

/**
 * Post-save toast body; the processor pushes only when AI is enabled AND config push is on,
 * so the message must not promise a live push unconditionally.
 */
export const savedToastBody = (
  settings: AiEngineSettingsData,
  t: (key: string, fallback: string) => string,
): string =>
  settings.enabled && settings.pushConfigToEngine !== false
    ? t(
        "admin.settings.ai.saved.body",
        "Changes are pushed to the AI engine automatically.",
      )
    : t(
        "admin.settings.ai.saved.bodyNoPush",
        "Settings saved. They will apply the next time the AI engine picks up its configuration.",
      );

export interface ApiResponseWithPending<T> {
  _pending?: Partial<T>;
}

export type AiEngineApiResponse = AiEngineSettingsData &
  ApiResponseWithPending<AiEngineSettingsData>;

/** Free-text model suggestions per provider (hints only). */
export const MODEL_SUGGESTIONS: Record<string, string[]> = {
  anthropic: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
  ollama: ["llama3.1", "qwen2.5", "mistral"],
  custom: ["llama3.1", "qwen2.5", "mistral"],
};

/** Free-text embedding-model suggestions per embedding provider. */
export const EMBEDDING_MODEL_SUGGESTIONS: Record<string, string[]> = {
  voyageai: ["voyage-4", "voyage-3.5"],
  openai: ["text-embedding-3-small", "text-embedding-3-large"],
  ollama: ["nomic-embed-text", "mxbai-embed-large", "bge-m3"],
  custom: ["nomic-embed-text", "mxbai-embed-large", "bge-m3"],
};
