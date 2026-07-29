import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Home } from "@portal/views/Home";
import { Users } from "@portal/views/Users";
import { Documents } from "@portal/views/Documents";
import { Pipelines } from "@portal/views/Pipelines";
import { PipelineBuilder } from "@portal/views/PipelineBuilder";
import { Sources } from "@portal/views/Sources";
import { Integrations } from "@portal/views/Integrations";
import { Policies } from "@portal/views/Policies";
import { EditorAdmin } from "@portal/views/EditorAdmin";
import { Infrastructure } from "@portal/views/Infrastructure";
import { PortalBillingGate } from "@portal/components/billing/PortalBillingGate";
import { Procurement } from "@portal/views/Procurement";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";

// Lazy so the generated docs manifest (bundled JSON) lands in its own chunk.
const DeveloperDocs = lazy(() =>
  import("@portal/views/DeveloperDocs").then((m) => ({
    default: m.DeveloperDocs,
  })),
);

// The portal mounts as a route-set under /processor/* in the editor app, so these
// child routes are relative to that base: strip the leading slash from the
// logical VIEW_PATHS, and home is the index route. Redirects use toPortalPath
// so they resolve to the portal, not the editor root.
const rel = (viewPath: string) => viewPath.replace(/^\//, "");

export function ViewRouter() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path={rel(VIEW_PATHS.users)} element={<Users />} />
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
      <Route path={rel(VIEW_PATHS.policies)} element={<Policies />} />
      <Route path={rel(VIEW_PATHS.documents)} element={<Documents />} />
      <Route path={rel(VIEW_PATHS.editor)} element={<EditorAdmin />} />
      <Route
        path={rel(VIEW_PATHS.infrastructure)}
        element={<Infrastructure />}
      />
      <Route path={rel(VIEW_PATHS.usage)} element={<PortalBillingGate />} />
      <Route path={rel(VIEW_PATHS.procurement)} element={<Procurement />} />
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
        element={<Navigate to={toPortalPath(VIEW_PATHS.home)} replace />}
      />
      {/* Settings is a modal overlay, not a route (see AppShell + UIContext). */}
      {/* Unknown paths land on Home. */}
      <Route
        path="*"
        element={<Navigate to={toPortalPath(VIEW_PATHS.home)} replace />}
      />
    </Routes>
  );
}
