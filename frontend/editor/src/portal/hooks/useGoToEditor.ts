import { useNavigate } from "react-router-dom";
import { EDITOR_URL, EDITOR_IS_SAME_APP } from "@portal/auth/editorUrl";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";

/** Join a basename and a route without doubling the slash when the basename is "/". */
function joinEditorPath(base: string, path: string): string {
  if (!path) return base;
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Navigate to the editor app, optionally deep-linking to one of its tool routes
 * (e.g. "/automate"). Editor and portal are one SPA when the editor serves this
 * origin's root, so the switch stays client-side; an absolute EDITOR_URL (dev
 * cross-app setup) needs a full page load.
 */
export function useGoToEditor(): (toolPath?: string) => void {
  const navigate = useNavigate();
  return (toolPath = "") => {
    if (EDITOR_IS_SAME_APP) navigate(joinEditorPath(EDITOR_BASENAME, toolPath));
    else window.location.href = joinEditorPath(EDITOR_URL, toolPath);
  };
}
