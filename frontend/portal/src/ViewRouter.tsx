import { Navigate, Route, Routes } from "react-router-dom";
import { Home } from "@app/views/Home";
import { Placeholder } from "@app/views/Placeholder";
import { VIEW_PATHS, type ViewId } from "@app/contexts/ViewContext";

const PLACEHOLDER_PHASES: Partial<Record<ViewId, string>> = {
  editor: "Phase 8 — Editor",
  sources: "Phase 5 — Sources & Agents",
  pipelines: "Phase 4 — Pipelines",
  documents: "Phase 6 — Documents",
  infrastructure: "Phase 7 — Infrastructure",
  usage: "Phase 8 — Usage & Billing",
  docs: "Phase 8 — Developer Docs",
  settings: "Settings — modal overlay",
};

export function ViewRouter() {
  return (
    <Routes>
      <Route path={VIEW_PATHS.home} element={<Home />} />
      <Route
        path={VIEW_PATHS.pipelines}
        element={
          <Placeholder view="pipelines" phase={PLACEHOLDER_PHASES.pipelines} />
        }
      />
      <Route
        path={VIEW_PATHS.editor}
        element={
          <Placeholder view="editor" phase={PLACEHOLDER_PHASES.editor} />
        }
      />
      <Route
        path={VIEW_PATHS.sources}
        element={
          <Placeholder view="sources" phase={PLACEHOLDER_PHASES.sources} />
        }
      />
      <Route
        path={VIEW_PATHS.documents}
        element={
          <Placeholder view="documents" phase={PLACEHOLDER_PHASES.documents} />
        }
      />
      <Route
        path={VIEW_PATHS.infrastructure}
        element={
          <Placeholder
            view="infrastructure"
            phase={PLACEHOLDER_PHASES.infrastructure}
          />
        }
      />
      <Route
        path={VIEW_PATHS.usage}
        element={<Placeholder view="usage" phase={PLACEHOLDER_PHASES.usage} />}
      />
      <Route
        path={VIEW_PATHS.docs}
        element={<Placeholder view="docs" phase={PLACEHOLDER_PHASES.docs} />}
      />
      <Route
        path={VIEW_PATHS.settings}
        element={
          <Placeholder view="settings" phase={PLACEHOLDER_PHASES.settings} />
        }
      />
      {/* Unknown paths land on Home. */}
      <Route path="*" element={<Navigate to={VIEW_PATHS.home} replace />} />
    </Routes>
  );
}
