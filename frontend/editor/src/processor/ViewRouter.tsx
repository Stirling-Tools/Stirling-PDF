import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Home } from "@processor/views/Home";
import { Documents } from "@processor/views/Documents";
import { Review } from "@processor/views/Review";
import { Pipelines } from "@processor/views/Pipelines";
import { PipelineBuilder } from "@processor/views/PipelineBuilder";
import { Sources } from "@processor/views/Sources";
import { Integrations } from "@processor/views/Integrations";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";
import { DOCS_PATH } from "@app/routes/docsRoute";

/** Keeps the query and hash a moved tab's deep links carry (?tab=, #doc-id). */
function MovedTo({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

// The processor mounts as a route-set under /processor/* in the editor app, so these
// child routes are relative to that base: strip the leading slash from the
// logical VIEW_PATHS, and home is the index route. Redirects use toProcessorPath
// so they resolve to the processor, not the editor root.
const rel = (viewPath: string) => viewPath.replace(/^\//, "");

/** Redirect the retired Policies path to the unified Pipelines page, carrying any query string. */
function PoliciesRedirect() {
  const { search } = useLocation();
  return (
    <Navigate
      to={{ pathname: toProcessorPath(VIEW_PATHS.pipelines), search }}
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
          <Navigate
            to={`${toProcessorPath(VIEW_PATHS.sources)}?new=1`}
            replace
          />
        }
      />
      <Route
        path={`${rel(VIEW_PATHS.sources)}/:id`}
        element={<Navigate to={toProcessorPath(VIEW_PATHS.sources)} replace />}
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
      {/* Account-link is a settings section now. */}
      <Route
        path="account-link"
        element={<MovedTo to="/settings/account-link" />}
      />
      {/* Unknown paths land on Home. */}
      <Route
        path="*"
        element={<Navigate to={toProcessorPath(VIEW_PATHS.home)} replace />}
      />
    </Routes>
  );
}
