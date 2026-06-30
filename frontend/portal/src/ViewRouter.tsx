import { Navigate, Route, Routes } from "react-router-dom";
import { Home } from "@portal/views/Home";
import { Users } from "@portal/views/Users";
import { Documents } from "@portal/views/Documents";
import { Pipelines } from "@portal/views/Pipelines";
import { Sources } from "@portal/views/Sources";
import { AgentBuilder } from "@portal/views/AgentBuilder";
import { Policies } from "@portal/views/Policies";
import { Components } from "@portal/views/Components";
import { EditorAdmin } from "@portal/views/EditorAdmin";
import { Infrastructure } from "@portal/views/Infrastructure";
import { Usage } from "@portal/views/Usage";
import { DeveloperDocs } from "@portal/views/DeveloperDocs";
import { Procurement } from "@portal/views/Procurement";
import { VIEW_PATHS } from "@portal/contexts/ViewContext";

export function ViewRouter() {
  return (
    <Routes>
      <Route path={VIEW_PATHS.home} element={<Home />} />
      <Route path={VIEW_PATHS.users} element={<Users />} />
      <Route path={VIEW_PATHS.pipelines} element={<Pipelines />} />
      <Route path={VIEW_PATHS.sources} element={<Sources />} />
      <Route path={VIEW_PATHS["agent-builder"]} element={<AgentBuilder />} />
      <Route path={VIEW_PATHS.policies} element={<Policies />} />
      <Route path={VIEW_PATHS.documents} element={<Documents />} />
      <Route path={VIEW_PATHS.components} element={<Components />} />
      <Route path={VIEW_PATHS.editor} element={<EditorAdmin />} />
      <Route path={VIEW_PATHS.infrastructure} element={<Infrastructure />} />
      <Route path={VIEW_PATHS.usage} element={<Usage />} />
      <Route path={VIEW_PATHS.procurement} element={<Procurement />} />
      <Route path={VIEW_PATHS.docs} element={<DeveloperDocs />} />
      {/* Account-link is now a Settings panel; redirect legacy bookmarks home. */}
      <Route path="/account-link" element={<Navigate to="/" replace />} />
      {/* Settings is a modal overlay, not a route (see AppShell + UIContext). */}
      {/* Unknown paths land on Home. */}
      <Route path="*" element={<Navigate to={VIEW_PATHS.home} replace />} />
    </Routes>
  );
}
