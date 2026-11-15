import { Navigate, useLocation } from "react-router-dom";
import { Usage } from "@editor/portal/views/Usage";
import { legacyProcurementTarget } from "@processor/components/procurement/enterprisePath";

/** Hosted billing uses app authentication and never offers instance-link renewal. */
export function PortalBillingGate() {
  const procurementTarget = legacyProcurementTarget(useLocation().search);
  if (procurementTarget) return <Navigate to={procurementTarget} replace />;
  return <Usage />;
}
