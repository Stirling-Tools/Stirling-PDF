// Re-export from core for compatibility
// Override VALID_NAV_KEYS to include saas-specific keys
export const VALID_NAV_KEYS = [
  "overview",
  "password-security",
  "preferences",
  "notifications",
  "connections",
  "general",
  "people",
  "teams",
  "security",
  "identity",
  "plan",
  "payments",
  "requests",
  "developer",
  "api-keys",
  "hotkeys",
  "adminGeneral",
  "adminSecurity",
  "adminConnections",
  "adminPrivacy",
  "adminDatabase",
  "adminAdvanced",
  "adminLegal",
  "adminPremium",
  "adminFeatures",
  "adminPlan",
  "adminAudit",
  "adminUsage",
  "adminEndpoints",
] as const;

// Extend NavKey to include saas-specific keys
export type NavKey =
  | "overview"
  | "password-security"
  | "preferences"
  | "notifications"
  | "connections"
  | "general"
  | "people"
  | "teams"
  | "security"
  | "identity"
  | "plan"
  | "payments"
  | "requests"
  | "developer"
  | "api-keys"
  | "hotkeys"
  | "adminGeneral"
  | "adminSecurity"
  | "adminConnections"
  | "adminPrivacy"
  | "adminDatabase"
  | "adminAdvanced"
  | "adminLegal"
  | "adminPremium"
  | "adminFeatures"
  | "adminPlan"
  | "adminAudit"
  | "adminUsage"
  | "adminEndpoints";

// some of these are not used yet, but appear in figma designs
