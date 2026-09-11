import { Navigate, useLocation } from "react-router-dom";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";

/** Keep sales links resumable across sign-in, account linking and page reloads. */
export function ProcurementRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("procurement", "start");
  return (
    <Navigate to={`${toPortalPath(VIEW_PATHS.usage)}?${params}`} replace />
  );
}
