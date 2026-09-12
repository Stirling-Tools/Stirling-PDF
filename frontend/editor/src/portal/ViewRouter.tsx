import { useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Home } from "@portal/views/Home";
import { Documents } from "@portal/views/Documents";
import { Review } from "@portal/views/Review";
import { Pipelines } from "@portal/views/Pipelines";
import { PipelineBuilder } from "@portal/views/PipelineBuilder";
import { Sources } from "@portal/views/Sources";
import { Integrations } from "@portal/views/Integrations";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { DOCS_PATH } from "@app/routes/docsRoute";
import { useUI } from "@portal/contexts/UIContext";

/** Keeps the query and hash a moved tab's deep links carry (?tab=, #doc-id). */
function MovedTo({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

// The portal mounts as a route-set under /processor/* in the editor app, so these
// child routes are relative to that base: strip the leading slash from the
// logical VIEW_PATHS, and home is the index route. Redirects use toPortalPath
// so they resolve to the portal, not the editor root.
const rel = (viewPath: string) => viewPath.replace(/^\//, "");

/**
 * Procurement is not a surface of its own: the deal lives on Home, so this raises
 * the trial-setup step and bounces there. Raised imperatively rather than by
 * rendering <Navigate>, so the signal is set before the navigation, not racing it.
 */
function ProcurementRedirect() {
  const { requestTrialSetup } = useUI();
  const navigate = useNavigate();
  useEffect(() => {
    requestTrialSetup();
    navigate(toPortalPath(VIEW_PATHS.home), { replace: true });
  }, [requestTrialSetup, navigate]);
  return null;
}

/** Redirect the retired Policies path to the unified Pipelines page, carrying any query string. */
function PoliciesRedirect() {
  const { search } = useLocation();
  return (
    <Navigate
      to={{ pathname: toPortalPath(VIEW_PATHS.pipelines), search }}
      replace
    />
  );
}

export function ViewRouter() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path={rel(VIEW_PATHS.pipelines)} element={<Pipelines />} />
      <Route
        path={`${rel(VIEW_PATHS.pipelines)}/new`}
        element={<PipelineBuilder />}
      />
      <Route
        path={`${rel(VIEW_PATHS.pipelines)}/:id`}
        element={<PipelineBuilder />}
      />
      <Route path={rel(VIEW_PATHS.sources)} element={<Sources />} />
      {/* Source create/edit is a modal on the list now; old deep links land there. */}
      <Route
        path={`${rel(VIEW_PATHS.sources)}/new`}
        element={
          <Navigate to={`${toPortalPath(VIEW_PATHS.sources)}?new=1`} replace />
        }
      />
      <Route
        path={`${rel(VIEW_PATHS.sources)}/:id`}
        element={<Navigate to={toPortalPath(VIEW_PATHS.sources)} replace />}
      />
      <Route path={rel(VIEW_PATHS.integrations)} element={<Integrations />} />
      {/* Policies merged into Pipelines (a policy is a pipeline the org requires). Keep the old
          path working, preserving its query (e.g. onboarding's ?setup=<category>). */}
      <Route path={rel(VIEW_PATHS.policies)} element={<PoliciesRedirect />} />
      <Route path={rel(VIEW_PATHS.documents)} element={<Documents />} />
      <Route path={rel(VIEW_PATHS.review)} element={<Review />} />
      {/* Server administration and the docs browser are product-wide, so they
          left the processor. Their old URLs still resolve. */}
      <Route
        path={rel(VIEW_PATHS.users)}
        element={<MovedTo to="/settings/users" />}
      />
      <Route
        path={rel(VIEW_PATHS.infrastructure)}
        element={<MovedTo to="/settings/api-keys" />}
      />
      <Route
        path={rel(VIEW_PATHS.usage)}
        element={<MovedTo to="/settings/billing" />}
      />
      <Route path={rel(VIEW_PATHS.docs)} element={<MovedTo to={DOCS_PATH} />} />
      {/* A bare path, not a VIEW_PATHS entry: nothing should list it as a view. */}
      <Route path="procurement" element={<ProcurementRedirect />} />
      {/* Account-link is a settings section now. */}
      <Route
        path="account-link"
        element={<MovedTo to="/settings/account-link" />}
      />
      {/* Unknown paths land on Home. */}
      <Route
        path="*"
        element={<Navigate to={toPortalPath(VIEW_PATHS.home)} replace />}
      />
    </Routes>
  );
}
