import { Navigate, useLocation } from "react-router-dom";

/** Keep sales links resumable across sign-in, account linking and page reloads. */
export function ProcurementRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("procurement", "start");
  return <Navigate to={`/settings/billing?${params}`} replace />;
}
