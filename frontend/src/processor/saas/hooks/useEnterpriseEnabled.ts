// SaaS enterprise flag: derived from the plan tier (wallet-backed), not a local
// license bean. Shadows the self-hosted app-config version so Enterprise-only
// surfaces (e.g. Infrastructure > Audit) unlock for enterprise-plan tenants.

import { useTier } from "@portal/contexts/TierContext";
import type { EnterpriseState } from "@portal-proprietary/hooks/useEnterpriseEnabled";

export type { EnterpriseState };

export function useEnterpriseEnabled(): EnterpriseState {
  const { tier } = useTier();
  return { enabled: tier === "enterprise", loading: false };
}
