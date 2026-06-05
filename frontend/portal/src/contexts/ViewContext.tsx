import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type ViewId =
  | "home"
  | "editor"
  | "sources"
  | "pipelines"
  | "documents"
  | "infrastructure"
  | "usage"
  | "docs"
  | "settings";

export const VIEW_LABELS: Record<ViewId, string> = {
  home: "Home",
  editor: "Editor",
  sources: "Sources",
  pipelines: "Pipelines",
  documents: "Documents",
  infrastructure: "Infrastructure",
  usage: "Usage & Billing",
  docs: "Developer Docs",
  settings: "Settings",
};

export const VIEW_PATHS: Record<ViewId, string> = {
  home: "/",
  editor: "/editor",
  sources: "/sources",
  pipelines: "/pipelines",
  documents: "/documents",
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
 * Backwards-compatible facade over react-router. Components keep using
 * useView()/setActiveView the way they did before; URLs are now real.
 *
 * No <ViewProvider> wrapper exists any more — the router is the provider.
 * App.tsx wraps its children in <BrowserRouter>.
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
