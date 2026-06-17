import { Navigate, Route, Routes } from "react-router-dom";
import { Home } from "@portal/views/Home";
import { Documents } from "@portal/views/Documents";
import { Pipelines } from "@portal/views/Pipelines";
import { Sources } from "@portal/views/Sources";
import { Infrastructure } from "@portal/views/Infrastructure";
import { Usage } from "@portal/views/Usage";
import { DeveloperDocs } from "@portal/views/DeveloperDocs";
import { VIEW_PATHS } from "@portal/contexts/ViewContext";

export function ViewRouter() {
  return (
    <Routes>
      <Route path={VIEW_PATHS.home} element={<Home />} />
      <Route path={VIEW_PATHS.pipelines} element={<Pipelines />} />
      <Route path={VIEW_PATHS.sources} element={<Sources />} />
      <Route path={VIEW_PATHS.documents} element={<Documents />} />
      <Route path={VIEW_PATHS.infrastructure} element={<Infrastructure />} />
      <Route path={VIEW_PATHS.usage} element={<Usage />} />
      <Route path={VIEW_PATHS.docs} element={<DeveloperDocs />} />
      {/* Settings is a modal overlay, not a route (see AppShell + UIContext). */}
      {/* Unknown paths land on Home. */}
      <Route path="*" element={<Navigate to={VIEW_PATHS.home} replace />} />
    </Routes>
  );
}
