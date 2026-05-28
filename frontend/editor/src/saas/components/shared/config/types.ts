import { VALID_NAV_KEYS as CORE_NAV_KEYS } from "@core/components/shared/config/types";

// SaaS adds an "overview" account section. All other keys (including ones
// SaaS doesn't render today) come from core - subtracting them here would
// just break the type union without affecting runtime nav.
export const VALID_NAV_KEYS = [...CORE_NAV_KEYS, "overview"] as const;

export type NavKey = (typeof VALID_NAV_KEYS)[number];
