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

// Label maps hold i18n keys, resolved via t(MAP[value]) at the render sites.
export const REGION_LABEL: Record<RegionStatus, string> = {
  healthy: "portal.infrastructure.regionLabel.healthy",
  degraded: "portal.infrastructure.regionLabel.degraded",
  down: "portal.infrastructure.regionLabel.down",
};

export const DEPLOY_TONE: Record<DeploymentStatus, StatusTone> = {
  live: "success",
  rolling: "info",
  "rolled-back": "warning",
  queued: "neutral",
};

export const DEPLOY_LABEL: Record<DeploymentStatus, string> = {
  live: "portal.infrastructure.deployLabel.live",
  rolling: "portal.infrastructure.deployLabel.rolling",
  "rolled-back": "portal.infrastructure.deployLabel.rolledBack",
  queued: "portal.infrastructure.deployLabel.queued",
};

export const KEY_TONE: Record<ApiKeyStatus, StatusTone> = {
  active: "success",
  revoked: "danger",
};

export const KEY_LABEL: Record<ApiKeyStatus, string> = {
  active: "portal.infrastructure.keyLabel.active",
  revoked: "portal.infrastructure.keyLabel.revoked",
};

export const CERT_TONE: Record<CertStatus, StatusTone> = {
  certified: "success",
  "in-progress": "warning",
  "not-started": "neutral",
};

export const CERT_LABEL: Record<CertStatus, string> = {
  certified: "portal.infrastructure.certLabel.certified",
  "in-progress": "portal.infrastructure.certLabel.inProgress",
  "not-started": "portal.infrastructure.certLabel.notStarted",
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
  attested: "portal.infrastructure.attestationLabel.attested",
  "in-scope": "portal.infrastructure.attestationLabel.inScope",
  "not-applicable": "portal.infrastructure.attestationLabel.notApplicable",
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
  success: "portal.infrastructure.auditStatusLabel.success",
  warning: "portal.infrastructure.auditStatusLabel.warning",
  danger: "portal.infrastructure.auditStatusLabel.danger",
  info: "portal.infrastructure.auditStatusLabel.info",
};

export const AUDIT_CAT_LABEL: Record<AuditCategory, string> = {
  auth: "portal.infrastructure.auditCatLabel.auth",
  config: "portal.infrastructure.auditCatLabel.config",
  elevation: "portal.infrastructure.auditCatLabel.elevation",
  policy: "portal.infrastructure.auditCatLabel.policy",
  processing: "portal.infrastructure.auditCatLabel.processing",
  security: "portal.infrastructure.auditCatLabel.security",
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
  active: "portal.infrastructure.modelLabel.active",
  degraded: "portal.infrastructure.modelLabel.degraded",
  disabled: "portal.infrastructure.modelLabel.disabled",
};

export const MODEL_TYPE_LABEL: Record<ModelType, string> = {
  extraction: "portal.infrastructure.modelTypeLabel.extraction",
  classification: "portal.infrastructure.modelTypeLabel.classification",
  ocr: "portal.infrastructure.modelTypeLabel.ocr",
  llm: "portal.infrastructure.modelTypeLabel.llm",
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
  if (cost === 0) return t("portal.infrastructure.models.metrics.included");
  const price = `$${cost.toFixed(unit === "per-call" ? 3 : 2)}`;
  return unit === "per-call"
    ? t("portal.infrastructure.models.cost.perCall", { price })
    : t("portal.infrastructure.models.cost.perThousand", { price });
}
