import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Home } from "@processor/views/Home";
import { Users } from "@processor/views/Users";
import { Documents } from "@processor/views/Documents";
import { Pipelines } from "@processor/views/Pipelines";
import { PipelineBuilder } from "@processor/views/PipelineBuilder";
import { Sources } from "@processor/views/Sources";
import { Integrations } from "@processor/views/Integrations";
import { EditorAdmin } from "@processor/views/EditorAdmin";
import { Infrastructure } from "@processor/views/Infrastructure";
import { ProcessorBillingGate } from "@processor/components/billing/ProcessorBillingGate";
import { ConnectGuardedRoute } from "@processor/components/account-link/ConnectGuardedRoute";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";

// Lazy so the generated docs manifest (bundled JSON) lands in its own chunk.
const DeveloperDocs = lazy(() =>
  import("@processor/views/DeveloperDocs").then((m) => ({
    default: m.DeveloperDocs,
  })),
);

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
      <Route path={rel(VIEW_PATHS.users)} element={<Users />} />
      <Route path={rel(VIEW_PATHS.pipelines)} element={<Pipelines />} />
      {/* Building and editing need a linked account. Gated at the route so every way in is
          covered: the list, the Documents review queue, the Connect flow's next steps, and a
          typed URL. */}
      <Route
        path={`${rel(VIEW_PATHS.pipelines)}/new`}
        element={
          <ConnectGuardedRoute fallback={toProcessorPath(VIEW_PATHS.pipelines)}>
            <PipelineBuilder />
          </ConnectGuardedRoute>
        }
      />
      <Route
        path={`${rel(VIEW_PATHS.pipelines)}/:id`}
        element={
          <ConnectGuardedRoute fallback={toProcessorPath(VIEW_PATHS.pipelines)}>
            <PipelineBuilder />
          </ConnectGuardedRoute>
        }
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
      <Route path={rel(VIEW_PATHS.editor)} element={<EditorAdmin />} />
      <Route
        path={rel(VIEW_PATHS.infrastructure)}
        element={<Infrastructure />}
      />
      <Route path={rel(VIEW_PATHS.usage)} element={<ProcessorBillingGate />} />
      <Route
        path={rel(VIEW_PATHS.docs)}
        element={
          <Suspense fallback={null}>
            <DeveloperDocs />
          </Suspense>
        }
      />
      {/* Account-link is now a Settings panel; redirect legacy bookmarks home. */}
      <Route
        path="account-link"
        element={<Navigate to={toProcessorPath(VIEW_PATHS.home)} replace />}
      />
      {/* Settings is a modal overlay, not a route (see AppShell + UIContext). */}
      {/* Unknown paths land on Home. */}
      <Route
        path="*"
        element={<Navigate to={toProcessorPath(VIEW_PATHS.home)} replace />}
      />
    </Routes>
  );
}
