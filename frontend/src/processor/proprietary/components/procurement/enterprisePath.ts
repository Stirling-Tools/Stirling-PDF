import { useNavigate } from "react-router-dom";

/** The Enterprise page: trial, quote, agreement and licence, outside the app's own chrome. */
export const ENTERPRISE_PATH = "/procurement";

export function useOpenEnterprise(): () => void {
  const navigate = useNavigate();
  return () => navigate(ENTERPRISE_PATH);
}
