import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { hostedEnterpriseUrl } from "@processor/components/procurement/enterpriseEntry";

/**
 * Self-hosted: forwards to the hosted Enterprise page, where Enterprise is bought. The SaaS build
 * shadows this with the page itself.
 */
export function EnterpriseApp() {
  const { search, hash } = useLocation();
  useEffect(() => {
    window.location.replace(hostedEnterpriseUrl(`${search}${hash}`));
  }, [search, hash]);
  return null;
}
