import type { TFunction } from "i18next";
import type { ChipAccent, StatusTone } from "@app/ui";
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
} from "@processor/api/infrastructure";

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

// Label maps hold i18n keys, resolved via t(MAP[value]) at the render sites.
export const REGION_LABEL: Record<RegionStatus, string> = {
  healthy: "processor.infrastructure.regionLabel.healthy",
  degraded: "processor.infrastructure.regionLabel.degraded",
  down: "processor.infrastructure.regionLabel.down",
};

export const DEPLOY_TONE: Record<DeploymentStatus, StatusTone> = {
  live: "success",
  rolling: "info",
  "rolled-back": "warning",
  queued: "neutral",
};

export const DEPLOY_LABEL: Record<DeploymentStatus, string> = {
  live: "processor.infrastructure.deployLabel.live",
  rolling: "processor.infrastructure.deployLabel.rolling",
  "rolled-back": "processor.infrastructure.deployLabel.rolledBack",
  queued: "processor.infrastructure.deployLabel.queued",
};

export const KEY_TONE: Record<ApiKeyStatus, StatusTone> = {
  active: "success",
  revoked: "danger",
};

export const KEY_LABEL: Record<ApiKeyStatus, string> = {
  active: "processor.infrastructure.keyLabel.active",
  revoked: "processor.infrastructure.keyLabel.revoked",
};

export const CERT_TONE: Record<CertStatus, StatusTone> = {
  certified: "success",
  "in-progress": "warning",
  "not-started": "neutral",
};

export const CERT_LABEL: Record<CertStatus, string> = {
  certified: "processor.infrastructure.certLabel.certified",
  "in-progress": "processor.infrastructure.certLabel.inProgress",
  "not-started": "processor.infrastructure.certLabel.notStarted",
};

// Brand/acronym key-management modes are not localised.
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
  attested: "processor.infrastructure.attestationLabel.attested",
  "in-scope": "processor.infrastructure.attestationLabel.inScope",
  "not-applicable": "processor.infrastructure.attestationLabel.notApplicable",
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

// Human labels for the status badge: danger/warning are tones, not outcomes (read "Error").
export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  success: "processor.infrastructure.auditStatusLabel.success",
  warning: "processor.infrastructure.auditStatusLabel.warning",
  danger: "processor.infrastructure.auditStatusLabel.danger",
  info: "processor.infrastructure.auditStatusLabel.info",
};

export const AUDIT_CAT_LABEL: Record<AuditCategory, string> = {
  auth: "processor.infrastructure.auditCatLabel.auth",
  config: "processor.infrastructure.auditCatLabel.config",
  elevation: "processor.infrastructure.auditCatLabel.elevation",
  policy: "processor.infrastructure.auditCatLabel.policy",
  processing: "processor.infrastructure.auditCatLabel.processing",
  security: "processor.infrastructure.auditCatLabel.security",
};

export const AUDIT_CAT_TONE: Record<AuditCategory, StatusTone> = {
  auth: "info",
  config: "neutral",
  elevation: "purple",
  policy: "purple",
  processing: "success",
  security: "warning",
};

export const MODEL_TONE: Record<ModelStatus, StatusTone> = {
  active: "success",
  degraded: "warning",
  disabled: "neutral",
};

export const MODEL_LABEL: Record<ModelStatus, string> = {
  active: "processor.infrastructure.modelLabel.active",
  degraded: "processor.infrastructure.modelLabel.degraded",
  disabled: "processor.infrastructure.modelLabel.disabled",
};

export const MODEL_TYPE_LABEL: Record<ModelType, string> = {
  extraction: "processor.infrastructure.modelTypeLabel.extraction",
  classification: "processor.infrastructure.modelTypeLabel.classification",
  ocr: "processor.infrastructure.modelTypeLabel.ocr",
  llm: "processor.infrastructure.modelTypeLabel.llm",
};

export const MODEL_TYPE_TONE: Record<ModelType, ChipAccent> = {
  extraction: "default",
  classification: "premium",
  ocr: "success",
  llm: "warning",
};

// Provider names are proper nouns, not localised.
export const MODEL_PROVIDER_LABEL: Record<ModelProvider, string> = {
  stirling: "Stirling",
  openai: "OpenAI",
  anthropic: "Anthropic",
  "on-prem": "On-prem",
};

/** Render a model's cost with the unit it's billed against. */
export function modelCost(
  t: TFunction,
  cost: number,
  unit: ModelCostUnit,
): string {
  if (cost === 0) return t("processor.infrastructure.models.metrics.included");
  const price = `$${cost.toFixed(unit === "per-call" ? 3 : 2)}`;
  return unit === "per-call"
    ? t("processor.infrastructure.models.cost.perCall", { price })
    : t("processor.infrastructure.models.cost.perThousand", { price });
}
