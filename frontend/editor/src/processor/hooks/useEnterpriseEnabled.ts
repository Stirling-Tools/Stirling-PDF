// Enterprise-license flag for the processor, from the backend app-config (`runningEE`).
// Gates Enterprise-only surfaces (e.g. Infrastructure > Audit) so they show a locked
// upsell instead of firing a doomed 403 request. The SaaS build shadows this file to
// derive enterprise from the plan tier (wallet-backed) - see processor-saas.

import { useAppConfig } from "@app/contexts/AppConfigContext";

export interface EnterpriseState {
  enabled: boolean;
  // True while the flag is still resolving, so callers can hold rather than flash a lock.
  loading: boolean;
}

export function useEnterpriseEnabled(): EnterpriseState {
  const { config, loading } = useAppConfig();
  return { enabled: Boolean(config?.runningEE), loading };
}
