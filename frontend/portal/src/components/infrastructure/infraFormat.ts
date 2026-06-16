import type { StatusTone } from "@shared/components";
import type {
  ApiKeyStatus,
  AuditCategory,
  AuditStatus,
  CertStatus,
  DeploymentStatus,
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
