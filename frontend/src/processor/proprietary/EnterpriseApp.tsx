import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { hostedEnterpriseUrl } from "@processor/components/procurement/enterpriseEntry";

/**
 * Self-hosted: Enterprise is bought on the hosted Enterprise page, signed in to a Stirling account
 * there, and applied here as a licence key, so this server's own Enterprise address forwards to it.
 * The SaaS build shadows this with the page itself.
 */
export function EnterpriseApp() {
  const { search, hash } = useLocation();
  useEffect(() => {
    window.location.replace(hostedEnterpriseUrl(`${search}${hash}`));
  }, [search, hash]);
  return null;
}
