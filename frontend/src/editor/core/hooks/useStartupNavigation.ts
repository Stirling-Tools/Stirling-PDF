import { useEffect, useEffectEvent, useRef } from "react";
import type { WorkbenchType } from "@editor/types/workbench";
import { useBulkAddProgress } from "@editor/services/bulkAddProgress";
import {
  hasPendingUnlocks,
  subscribeToPendingUnlocks,
} from "@editor/services/pendingUnlocks";
import { isApplyingRestoredView } from "@editor/services/workbenchSession";
import {
  getStartupNavigationAction,
  type StartupNavigationAction,
} from "@editor/utils/homePageNavigation";

/**
 * Picks the view as files arrive on the workbench: one file from empty opens
 * the viewer, several open Active Files (see getStartupNavigationAction).
 * Calls `apply` with each choice, except while a session restore is reopening
 * the view the user left, which wins over this heuristic.
 *
 * Files from one upload are published one at a time, and locked PDFs only once
 * unlocked, so the file count alone can't tell one file from several. An
 * upload's own size decides instead: several files onto an empty workbench
 * switch to Active Files as the upload starts, and the count-driven choice
 * waits for the upload to end.
 */
export function useStartupNavigation(
  fileCount: number,
  selectedToolKey: string | null,
  workbench: WorkbenchType,
  apply: (action: StartupNavigationAction) => void,
): void {
  const prevCountRef = useRef(fileCount);
  const importTotal = useBulkAddProgress().total;
  const importingSeveral = importTotal > 1;
  // Locked files of such an upload arrive after it ends, one by one, and must
  // still land in Active Files.
  const severalIntoEmptyRef = useRef(false);
  // The upload already picked the view, so its end must not undo a switch the
  // user made while it ran.
  const viewChosenForUploadRef = useRef(false);

  const choose = useEffectEvent((action: StartupNavigationAction | null) => {
    if (action && !isApplyingRestoredView()) apply(action);
  });

  const onUploadStart = useEffectEvent((total: number) => {
    severalIntoEmptyRef.current = total > 1 && prevCountRef.current === 0;
    if (!severalIntoEmptyRef.current) return;
    choose(getStartupNavigationAction(0, total, selectedToolKey, workbench));
    viewChosenForUploadRef.current = true;
  });
  useEffect(() => {
    if (importTotal > 0) onUploadStart(importTotal);
  }, [importTotal]);

  // Skipping every prompt leaves nothing of the upload to open.
  useEffect(
    () =>
      subscribeToPendingUnlocks(() => {
        if (!hasPendingUnlocks()) severalIntoEmptyRef.current = false;
      }),
    [],
  );

  useEffect(() => {
    if (importingSeveral) return;
    const prevCount = prevCountRef.current;
    prevCountRef.current = fileCount;

    let action = getStartupNavigationAction(
      prevCount,
      fileCount,
      selectedToolKey,
      workbench,
    );
    if (
      action?.workbench === "viewer" &&
      prevCount === 0 &&
      severalIntoEmptyRef.current
    ) {
      action = { workbench: "fileEditor" };
    }
    if (fileCount > 0 || !hasPendingUnlocks()) {
      severalIntoEmptyRef.current = false;
    }
    if (viewChosenForUploadRef.current) {
      viewChosenForUploadRef.current = false;
      if (prevCount === 0) action = null;
    }
    choose(action);
  }, [importingSeveral, fileCount, selectedToolKey, workbench]);
}
