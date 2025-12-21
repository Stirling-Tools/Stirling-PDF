// Single source of truth for all valid nav keys
export const VALID_NAV_KEYS = [
  'preferences',
  'notifications',
  'connections',
  'account',
  'general',
  'people',
  'teams',
  'security',
  'identity',
  'plan',
  'payments',
  'requests',
  'developer',
  'api-keys',
  'hotkeys',
  'adminGeneral',
  'adminSecurity',
  'adminConnections',
  'adminPrivacy',
  'adminDatabase',
  'adminAdvanced',
  'adminLegal',
  'adminPremium',
  'adminFeatures',
  'adminPlan',
  'adminAudit',
  'adminUsage',
  'adminEndpoints',
] as const;

// Derive the type from the array
export type NavKey = typeof VALID_NAV_KEYS[number];

// some of these are not used yet, but appear in figma designs