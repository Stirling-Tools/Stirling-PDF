import type { StatusTone } from "@app/ui";
import type {
  ApiKeyStatus,
  AuditCategory,
  AuditStatus,
} from "@portal/api/infrastructure";

export const KEY_TONE: Record<ApiKeyStatus, StatusTone> = {
  active: "success",
  revoked: "danger",
};

// Label maps hold i18n keys, resolved via t(MAP[value]) at the render sites.
export const KEY_LABEL: Record<ApiKeyStatus, string> = {
  active: "portal.infrastructure.keyLabel.active",
  revoked: "portal.infrastructure.keyLabel.revoked",
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
