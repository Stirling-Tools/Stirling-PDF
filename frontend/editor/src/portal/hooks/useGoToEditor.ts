import { useNavigate } from "react-router-dom";
import { EDITOR_URL, EDITOR_IS_SAME_APP } from "@portal/auth/editorUrl";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";

function joinEditorPath(base: string, path: string): string {
  if (!path) return base;
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Navigates to the editor, client-side when it serves this origin's root. Tool
 * paths are origin-relative and must not be joined to EDITOR_BASENAME, which would
 * match no tool.
 */
export function useGoToEditor(): (toolPath?: string) => void {
  const navigate = useNavigate();
  return (toolPath = "") => {
    if (EDITOR_IS_SAME_APP) navigate(toolPath || EDITOR_BASENAME);
    else window.location.href = joinEditorPath(EDITOR_URL, toolPath);
  };
}
