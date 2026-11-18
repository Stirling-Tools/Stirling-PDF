import { useCallback } from "react";

const SAAS_FRONTEND_URL = (
  import.meta.env.VITE_SAAS_FRONTEND_URL || "https://stirling.com/app"
).replace(/\/+$/, "");

/**
 * Self-hosted: Enterprise is bought on the hosted page and reaches this server only as a licence
 * key, so the server never runs or tracks the deal. Shadowed in the SaaS build.
 */
export const HOSTS_ENTERPRISE_DEAL = false;

/** The hosted Enterprise page, carrying over a link's query and hash (?source=sales). */
export function hostedEnterpriseUrl(search = ""): string {
  return `${SAAS_FRONTEND_URL}/enterprise${search}`;
}

export function useOpenEnterprise(): () => void {
  return useCallback(() => {
    window.open(hostedEnterpriseUrl(), "_blank", "noopener,noreferrer");
  }, []);
}
