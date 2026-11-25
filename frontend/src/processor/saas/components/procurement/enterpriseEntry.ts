import { useNavigate } from "react-router-dom";
import { ENTERPRISE_PATH } from "@processor/components/procurement/enterprisePath";

/** SaaS: this app hosts the Enterprise page and runs the deal on the signed-in account. */
export const HOSTS_ENTERPRISE_DEAL = true;

export function useOpenEnterprise(): () => void {
  const navigate = useNavigate();
  return () => navigate(ENTERPRISE_PATH);
}
