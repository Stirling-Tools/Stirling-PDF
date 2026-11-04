import { useNavigate } from "react-router-dom";

/** The Enterprise page: trial, quote, agreement and licence, outside the app's own chrome. */
export const ENTERPRISE_PATH = "/procurement";

/** Opens the Enterprise page from within the app, which its back button then returns to. */
export function useOpenEnterprise(): () => void {
  const navigate = useNavigate();
  return () => navigate(ENTERPRISE_PATH, { state: { fromApp: true } });
}

/**
 * Where a billing link that set out to start the Enterprise trial (`?procurement=start`, sent in
 * sales emails) now leads, keeping its other parameters; null for any other billing link.
 */
export function legacyProcurementTarget(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("procurement") !== "start") return null;
  params.delete("procurement");
  const rest = params.toString();
  return rest ? `${ENTERPRISE_PATH}?${rest}` : ENTERPRISE_PATH;
}
