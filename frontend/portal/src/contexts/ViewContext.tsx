import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type ViewId =
  | "home"
  | "editor"
  | "users"
  | "sources"
  | "agent-builder"
  | "policies"
  | "pipelines"
  | "documents"
  | "components"
  | "infrastructure"
  | "usage"
  | "docs"
  | "settings";

export const VIEW_LABELS: Record<ViewId, string> = {
  home: "Home",
  editor: "Editor",
  users: "Users",
  sources: "Sources",
  "agent-builder": "Agent Builder",
  policies: "Policies",
  pipelines: "Pipelines",
  documents: "Documents",
  components: "Components",
  infrastructure: "Infrastructure",
  usage: "Usage & Billing",
  docs: "Developer Docs",
  settings: "Settings",
};

export const VIEW_PATHS: Record<ViewId, string> = {
  home: "/",
  editor: "/editor",
  users: "/users",
  sources: "/sources",
  "agent-builder": "/agent-builder",
  policies: "/policies",
  pipelines: "/pipelines",
  documents: "/documents",
  components: "/components",
  infrastructure: "/infrastructure",
  usage: "/usage",
  docs: "/docs",
  settings: "/settings",
};

const PATH_TO_VIEW: Record<string, ViewId> = Object.fromEntries(
  (Object.entries(VIEW_PATHS) as Array<[ViewId, string]>).map(
    ([view, path]) => [path, view],
  ),
);

function deriveActiveView(pathname: string): ViewId {
  // Exact match first; otherwise treat the first segment as the view.
  if (PATH_TO_VIEW[pathname]) return PATH_TO_VIEW[pathname];
  const firstSegment = "/" + pathname.split("/").filter(Boolean)[0];
  return PATH_TO_VIEW[firstSegment] ?? "home";
}

interface ViewContextValue {
  activeView: ViewId;
  setActiveView: (view: ViewId) => void;
}

/**
 * Facade over react-router so components navigate by `ViewId` (activeView /
 * setActiveView) while URLs stay the source of truth. There is no
 * <ViewProvider> — the router is the provider; App.tsx supplies <BrowserRouter>.
 */
export function useView(): ViewContextValue {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeView = useMemo(() => deriveActiveView(pathname), [pathname]);
  const setActiveView = useCallback(
    (view: ViewId) => navigate(VIEW_PATHS[view]),
    [navigate],
  );
  return { activeView, setActiveView };
}
