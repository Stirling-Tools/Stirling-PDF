import type { ChipTone, StatusTone } from "@shared/components";
import type {
  ApiKeyStatus,
  AttestationStatus,
  AuditCategory,
  AuditStatus,
  CertStatus,
  DeploymentStatus,
  KeyMode,
  ModelCostUnit,
  ModelProvider,
  ModelStatus,
  ModelType,
  RegionStatus,
} from "@portal/api/infrastructure";

/** Format a 0–1 fraction as a percentage string. */
export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Capitalise the first letter of a lower-case status word. */
export function titleCase(word: string): string {
  return word[0].toUpperCase() + word.slice(1);
}

export const REGION_TONE: Record<RegionStatus, StatusTone> = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
};

export const DEPLOY_TONE: Record<DeploymentStatus, StatusTone> = {
  live: "success",
  rolling: "info",
  "rolled-back": "warning",
  queued: "neutral",
};

export const DEPLOY_LABEL: Record<DeploymentStatus, string> = {
  live: "Live",
  rolling: "Rolling out",
  "rolled-back": "Rolled back",
  queued: "Queued",
};

export const KEY_TONE: Record<ApiKeyStatus, StatusTone> = {
  active: "success",
  revoked: "danger",
  "rotate-soon": "warning",
};

export const KEY_LABEL: Record<ApiKeyStatus, string> = {
  active: "Active",
  revoked: "Revoked",
  "rotate-soon": "Rotate soon",
};

export const CERT_TONE: Record<CertStatus, StatusTone> = {
  certified: "success",
  "in-progress": "warning",
  "not-started": "neutral",
};

export const CERT_LABEL: Record<CertStatus, string> = {
  certified: "Certified",
  "in-progress": "In progress",
  "not-started": "Not started",
};

export const KEY_MODE_LABEL: Record<KeyMode, string> = {
  managed: "Stirling-managed",
  byok: "BYOK",
  hyok: "HYOK",
};

export const KEY_MODE_TONE: Record<KeyMode, StatusTone> = {
  managed: "info",
  byok: "purple",
  // HYOK is the strongest posture (Stirling never sees plaintext) → success.
  hyok: "success",
};

export const ATTESTATION_LABEL: Record<AttestationStatus, string> = {
  attested: "Attested",
  "in-scope": "In scope",
  "not-applicable": "N/A",
};

export const ATTESTATION_TONE: Record<AttestationStatus, StatusTone> = {
  attested: "success",
  "in-scope": "warning",
  "not-applicable": "neutral",
};

export const AUDIT_TONE: Record<AuditStatus, StatusTone> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
};

export const AUDIT_CAT_LABEL: Record<AuditCategory, string> = {
  auth: "Auth",
  config: "Config",
  elevation: "Elevation",
  processing: "Processing",
  security: "Security",
};

export const AUDIT_CAT_TONE: Record<AuditCategory, StatusTone> = {
  auth: "info",
  config: "neutral",
  elevation: "purple",
  processing: "success",
  security: "warning",
};

export const MODEL_TONE: Record<ModelStatus, StatusTone> = {
  active: "success",
  degraded: "warning",
  disabled: "neutral",
};

export const MODEL_LABEL: Record<ModelStatus, string> = {
  active: "Active",
  degraded: "Degraded",
  disabled: "Disabled",
};

export const MODEL_TYPE_LABEL: Record<ModelType, string> = {
  extraction: "Extraction",
  classification: "Classification",
  ocr: "OCR",
  llm: "LLM",
};

export const MODEL_TYPE_TONE: Record<ModelType, ChipTone> = {
  extraction: "blue",
  classification: "purple",
  ocr: "green",
  llm: "amber",
};

export const MODEL_PROVIDER_LABEL: Record<ModelProvider, string> = {
  stirling: "Stirling",
  openai: "OpenAI",
  anthropic: "Anthropic",
  "on-prem": "On-prem",
};

/** Render a model's cost with the unit it's billed against. */
export function modelCost(cost: number, unit: ModelCostUnit): string {
  if (cost === 0) return "Included";
  const price = `$${cost.toFixed(unit === "per-call" ? 3 : 2)}`;
  return unit === "per-call" ? `${price}/call` : `${price}/1k`;
}
