import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";

/**
 * Desktop: AI-engine calls must hit the SaaS backend (the local bundled backend
 * has no AI engine). The AI surface is only shown in SaaS mode (gated by
 * useAiEngineEnabled), so returning the SaaS base unconditionally is correct —
 * when an AI call is made, the app is in SaaS mode.
 *
 * Used for the orchestrate stream (a raw fetch) and the AI result-file download,
 * which would otherwise resolve to the empty/local base and miss the engine.
 */
export function getAiBaseUrl(): string {
  return (STIRLING_SAAS_BACKEND_API_URL ?? "").replace(/\/$/, "");
}
