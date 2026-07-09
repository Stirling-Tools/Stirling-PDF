import { Navigate } from "react-router-dom";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";

/**
 * SaaS pre-release: Agent Builder isn't shipped yet and its Sources entry point is
 * hidden, so redirect any /agent-builder deep link back to Home.
 */
export function AgentBuilder() {
  return <Navigate to={toPortalPath(VIEW_PATHS.home)} replace />;
}
