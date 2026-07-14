import { useSaasAppConfig } from "@app/hooks/useSaasAppConfig";

/**
 * Desktop shadow: policy runs execute + bill via the cloud (POST
 * /api/v1/policies/.../run hits the SaaS backend), so the flag must come from
 * the SaaS backend's app-config, not the local bundled one. useSaasAppConfig()
 * returns null outside SaaS mode, so policies stay off in local/self-hosted -
 * which also stops the auto-run controller from firing GET /api/v1/policies at
 * a backend that doesn't serve it - and the cloud keeps the on/off switch.
 */
export function usePoliciesEnabled(): boolean {
  return Boolean(useSaasAppConfig()?.paygEnabled);
}
