// Shared types + constants for the aiEngine admin settings section.
// The four AI sub-pages fetch the same GET /section/aiEngine payload but each
// saves only its own dot-notation keys so sibling keys are preserved.

/** Secret fields come back masked as this literal when a value is set. */
export const MASKED_SECRET = "********";

/**
 * Coerce a numeric setting to a safe integer at submit time. Mantine's {@code min}/clampBehavior
 * only guards the input on blur; this guards the actual saved value so a cleared field ("" -> 0),
 * a transient "-" (-> NaN) or an explicit 0 can never be persisted below {@code min} (a 0 timeout
 * or concurrency would deadlock the engine).
 */
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
   * Whether the processor forwards these settings to the engine. Off in env-driven
   * deployments (SaaS pins it false), in which case a save is persisted but never reaches
   * the engine — the save toast has to say so rather than promise a live push.
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
 * Body for the post-save toast. The processor only pushes to the engine when AI is enabled
 * AND config push is on, so claiming a live push unconditionally would be wrong on exactly
 * the deployments where it matters most.
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
  anthropic: ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-1"],
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
