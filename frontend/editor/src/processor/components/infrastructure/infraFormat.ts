import type { StatusTone } from "@app/ui";
import type {
  ApiKeyStatus,
  AuditCategory,
  AuditStatus,
} from "@processor/api/infrastructure";

export const KEY_TONE: Record<ApiKeyStatus, StatusTone> = {
  active: "success",
  revoked: "danger",
};

// Label maps hold i18n keys, resolved via t(MAP[value]) at the render sites.
export const KEY_LABEL: Record<ApiKeyStatus, string> = {
  active: "processor.infrastructure.keyLabel.active",
  revoked: "processor.infrastructure.keyLabel.revoked",
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
