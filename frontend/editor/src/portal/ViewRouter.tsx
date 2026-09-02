import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Home } from "@portal/views/Home";
import { Documents } from "@portal/views/Documents";
import { Pipelines } from "@portal/views/Pipelines";
import { PipelineBuilder } from "@portal/views/PipelineBuilder";
import { Sources } from "@portal/views/Sources";
import { Integrations } from "@portal/views/Integrations";
import { Policies } from "@portal/views/Policies";
import { EditorAdmin } from "@portal/views/EditorAdmin";
import { ConnectGuardedRoute } from "@portal/components/account-link/ConnectGuardedRoute";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { DOCS_PATH } from "@app/routes/docsRoute";

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

export function ViewRouter() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path={rel(VIEW_PATHS.pipelines)} element={<Pipelines />} />
      {/* Building and editing need a linked account. Gated at the route so every way in is
          covered: the list, the Documents review queue, the Connect flow's next steps, and a
          typed URL. */}
      <Route
        path={`${rel(VIEW_PATHS.pipelines)}/new`}
        element={
          <ConnectGuardedRoute fallback={toPortalPath(VIEW_PATHS.pipelines)}>
            <PipelineBuilder />
          </ConnectGuardedRoute>
        }
      />
      <Route
        path={`${rel(VIEW_PATHS.pipelines)}/:id`}
        element={
          <ConnectGuardedRoute fallback={toPortalPath(VIEW_PATHS.pipelines)}>
            <PipelineBuilder />
          </ConnectGuardedRoute>
        }
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
      <Route path={rel(VIEW_PATHS.policies)} element={<Policies />} />
      <Route path={rel(VIEW_PATHS.documents)} element={<Documents />} />
      <Route path={rel(VIEW_PATHS.editor)} element={<EditorAdmin />} />
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
