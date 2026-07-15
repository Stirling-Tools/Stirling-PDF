// Shared types + constants for the aiEngine admin settings section.
// The four AI sub-pages fetch the same GET /section/aiEngine payload but each
// saves only its own dot-notation keys so sibling keys are preserved.

/** Secret fields come back masked as this literal when a value is set. */
export const MASKED_SECRET = "********";

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
  timeoutSeconds?: number;
  longRunningTimeoutSeconds?: number;
  streamTimeoutSeconds?: number;
  models?: AiEngineModels;
  rag?: AiEngineRag;
  limits?: AiEngineLimits;
  features?: AiEngineFeatures;
}

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
