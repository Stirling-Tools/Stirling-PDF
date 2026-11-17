import { useCallback } from "react";

const SAAS_FRONTEND_URL = (
  import.meta.env.VITE_SAAS_FRONTEND_URL || "https://stirling.com/app"
).replace(/\/+$/, "");

/**
 * Self-hosted: Enterprise is bought on the hosted Enterprise page and reaches this server only as a
 * licence key, so the server neither runs nor tracks the deal. The SaaS build shadows this file.
 */
export const HOSTS_ENTERPRISE_DEAL = false;

/** The hosted Enterprise page, keeping whatever query a link to it carries (?source=sales). */
export function hostedEnterpriseUrl(search = ""): string {
  return `${SAAS_FRONTEND_URL}/enterprise${search}`;
}

export function useOpenEnterprise(): () => void {
  return useCallback(() => {
    window.open(hostedEnterpriseUrl(), "_blank", "noopener,noreferrer");
  }, []);
}
