import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

export type ViewId =
  | "home"
  | "editor"
  | "users"
  | "sources"
  | "integrations"
  | "agent-builder"
  | "policies"
  | "pipelines"
  | "documents"
  | "components"
  | "infrastructure"
  | "usage"
  | "docs"
  | "procurement"
  | "settings";

export const VIEW_LABELS: Record<ViewId, string> = {
  home: "Home",
  editor: "Editor",
  users: "Users",
  sources: "Sources",
  integrations: "Integrations",
  "agent-builder": "Agent Builder",
  policies: "Policies",
  pipelines: "Pipelines",
  documents: "Documents",
  components: "Components",
  infrastructure: "Infrastructure",
  usage: "Usage & Billing",
  docs: "Developer Docs",
  procurement: "Procurement",
  settings: "Settings",
};

export const VIEW_PATHS: Record<ViewId, string> = {
  home: "/",
  editor: "/editor",
  users: "/users",
  sources: "/sources",
  integrations: "/integrations",
  "agent-builder": "/agent-builder",
  policies: "/policies",
  pipelines: "/pipelines",
  documents: "/documents",
  components: "/components",
  infrastructure: "/infrastructure",
  usage: "/usage",
  docs: "/docs",
  procurement: "/procurement",
  settings: "/settings",
};

/**
 * The portal is mounted as a route-set under this base path inside the editor
 * app (see the admin-route seam). VIEW_PATHS stay expressed as logical portal
 * paths; this facade adds/strips the base so components keep navigating by
 * ViewId without knowing where the portal is mounted. The constant lives in
 * core so portal-free build flavors can reference the mount point too.
 */
export { PORTAL_BASENAME };

/** Logical view path -> full app path (e.g. "/users" -> "/portal/users"). */
export function toPortalPath(viewPath: string): string {
  return `${PORTAL_BASENAME}${viewPath === "/" ? "" : viewPath}`;
}

const PATH_TO_VIEW: Record<string, ViewId> = Object.fromEntries(
  (Object.entries(VIEW_PATHS) as Array<[ViewId, string]>).map(
    ([view, path]) => [path, view],
  ),
);

function deriveActiveView(pathname: string): ViewId {
  // Strip the portal base, then match against the logical VIEW_PATHS.
  let inner = pathname.startsWith(PORTAL_BASENAME)
    ? pathname.slice(PORTAL_BASENAME.length)
    : pathname;
  if (inner === "") inner = "/";
  // Exact match first; otherwise treat the first segment as the view.
  if (PATH_TO_VIEW[inner]) return PATH_TO_VIEW[inner];
  const firstSegment = "/" + inner.split("/").filter(Boolean)[0];
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
    (view: ViewId) => navigate(toPortalPath(VIEW_PATHS[view])),
    [navigate],
  );
  return { activeView, setActiveView };
}
