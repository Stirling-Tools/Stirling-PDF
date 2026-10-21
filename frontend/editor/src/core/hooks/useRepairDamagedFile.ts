import { useCallback } from "react";
import {
  useToolWorkflowActions,
  useToolWorkflowData,
} from "@app/contexts/ToolWorkflowContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import type { FileId } from "@app/types/file";

/**
 * Opens Repair on just this file. Tools take every workbench file outside the viewer, so the file
 * is shown there first, which scopes the tool to it without changing the workbench selection.
 * Undefined when the server has Repair disabled: tool selection would silently ignore it.
 */
export function useRepairDamagedFile(): ((fileId: FileId) => void) | undefined {
  const { actions: navActions } = useNavigationActions();
  const { setActiveFileId } = useViewer();
  const { handleToolSelect } = useToolWorkflowActions();
  const { toolAvailability } = useToolWorkflowData();
  const repair = useCallback(
    (fileId: FileId) => {
      setActiveFileId(fileId);
      navActions.setWorkbench("viewer");
      handleToolSelect("repair");
    },
    [navActions, setActiveFileId, handleToolSelect],
  );
  return toolAvailability.repair?.available === false ? undefined : repair;
}
