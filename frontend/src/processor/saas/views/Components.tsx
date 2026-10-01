import { Navigate } from "react-router-dom";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";

/**
 * SaaS pre-release: the Components page isn't shipped yet and its nav item is
 * hidden, so redirect any /components deep link back to Home.
 */
export function Components() {
  return <Navigate to={toPortalPath(VIEW_PATHS.home)} replace />;
}
