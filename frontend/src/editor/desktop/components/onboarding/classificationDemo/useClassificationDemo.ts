/** React access to the Downloads sweep: locates the folder, runs batches, exposes
 *  progress. The sweep itself is {@link runClassificationDemoSweep}; its state lives in
 *  the session store, so a remount picks up a running sweep instead of an idle one. */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFolders } from "@app/contexts/FolderContext";
import {
  beginSweep,
  isSweepCurrent,
  recordSwept,
  stopSweep,
  sweptPaths,
  updateSweep,
  useClassificationDemoSweep,
  type ClassificationDemoStatus,
} from "@app/components/onboarding/classificationDemo/classificationDemoSession";
import { useFileHandler } from "@app/hooks/useFileHandler";
import {
  CLASSIFICATION_DEMO_BATCH_SIZE,
  mergeOutcomes,
  resolveDownloadsDirectory,
  runClassificationDemoSweep,
  type ClassificationDemoOutcome,
  type ClassificationDemoProgress,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";

export interface ClassificationDemoState {
  status: ClassificationDemoStatus;
  /** Null until the folder has been located; the offer is pointless without it. */
  directory: string | null;
  progress: ClassificationDemoProgress;
  outcome: ClassificationDemoOutcome | null;
  start: (limit?: number) => void;
  cancel: () => void;
}

export function useClassificationDemo(
  active: boolean,
): ClassificationDemoState {
  const { t } = useTranslation();
  const { mountLocalFolder } = useFolders();
  const { addFiles } = useFileHandler();
  const { status, progress, outcome } = useClassificationDemoSweep();
  const [directory, setDirectory] = useState<string | null>(null);

  // From the OS, not the backend's `downloads-suggestion`: that endpoint is
  // proprietary-only, so the desktop-bundled backend 404s it every time.
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    void resolveDownloadsDirectory().then((dir) => {
      if (!stopped) setDirectory(dir);
    });
    return () => {
      stopped = true;
    };
  }, [active]);

  const start = useCallback(
    (limit: number = CLASSIFICATION_DEMO_BATCH_SIZE) => {
      if (!directory) return;
      const generation = beginSweep();
      void runClassificationDemoSweep(
        directory,
        {
          mountFolder: mountLocalFolder,
          addFiles,
          onProgress: (next) =>
            updateSweep(generation, () => ({ progress: next })),
          // Stopped only by an explicit Stop or dismissal: unmounting is not leaving,
          // since the view can remount mid-sweep and must find it still running.
          isCancelled: () => !isSweepCurrent(generation),
        },
        {
          limit,
          exclude: sweptPaths(),
          unclassifiedName: t("classificationDemo.groups.other", "Other"),
        },
      )
        .then((result) => {
          // Recorded even when cancelled: those documents were still taken on.
          recordSwept(result.sweptPaths);
          // Folded into what is there: a follow-up continues the same pile, so the
          // chart grows instead of restarting at the last handful.
          updateSweep(generation, ({ outcome: previous }) => ({
            outcome: previous ? mergeOutcomes(previous, result) : result,
            status: "done",
          }));
        })
        .catch(() => {
          updateSweep(generation, () => ({ status: "failed" }));
        });
    },
    [directory, mountLocalFolder, addFiles, t],
  );

  const cancel = useCallback(() => stopSweep(), []);

  return {
    status,
    directory,
    progress,
    outcome,
    start,
    cancel,
  };
}
