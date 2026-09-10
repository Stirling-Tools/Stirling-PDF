/** React state around the Downloads sweep: locates the folder, runs batches, exposes
 *  progress. The sweep itself is {@link runClassificationDemoSweep}. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFolders } from "@app/contexts/FolderContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import {
  CLASSIFICATION_DEMO_BATCH_SIZE,
  mergeOutcomes,
  resolveDownloadsDirectory,
  runClassificationDemoSweep,
  type ClassificationDemoOutcome,
  type ClassificationDemoProgress,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";

export type ClassificationDemoStatus = "idle" | "running" | "done" | "failed";

export interface ClassificationDemoState {
  status: ClassificationDemoStatus;
  /** Null until the folder has been located; the offer is pointless without it. */
  directory: string | null;
  progress: ClassificationDemoProgress;
  outcome: ClassificationDemoOutcome | null;
  start: (limit?: number) => void;
  cancel: () => void;
}

const IDLE_PROGRESS: ClassificationDemoProgress = {
  phase: "reading",
  processed: 0,
  total: 0,
  groups: [],
};

export function useClassificationDemo(
  active: boolean,
): ClassificationDemoState {
  const { t } = useTranslation();
  const { mountLocalFolder } = useFolders();
  const { addFiles } = useFileHandler();
  const [status, setStatus] = useState<ClassificationDemoStatus>("idle");
  const [directory, setDirectory] = useState<string | null>(null);
  const [progress, setProgress] =
    useState<ClassificationDemoProgress>(IDLE_PROGRESS);
  const [outcome, setOutcome] = useState<ClassificationDemoOutcome | null>(
    null,
  );
  // Held in a ref, not state: a follow-up batch reads it at the moment it starts, and
  // making it a dependency of `start` would rebuild the callback after every sweep.
  const sweptPaths = useRef<Set<string>>(new Set());
  const cancelled = useRef(false);

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
      cancelled.current = false;
      setStatus("running");
      setProgress({ ...IDLE_PROGRESS });
      void runClassificationDemoSweep(
        directory,
        {
          mountFolder: mountLocalFolder,
          addFiles,
          onProgress: setProgress,
          isCancelled: () => cancelled.current,
        },
        {
          limit,
          exclude: sweptPaths.current,
          unclassifiedName: t("classificationDemo.groups.other", "Other"),
        },
      )
        .then((result) => {
          // Recorded even when cancelled: those documents were still taken on.
          for (const path of result.sweptPaths) sweptPaths.current.add(path);
          if (cancelled.current) return;
          // Folded into what is there: a follow-up continues the same pile, so the
          // chart grows instead of restarting at the last handful.
          setOutcome((previous) =>
            previous ? mergeOutcomes(previous, result) : result,
          );
          setStatus("done");
        })
        .catch(() => {
          if (cancelled.current) return;
          setStatus("failed");
        });
    },
    [directory, mountLocalFolder, addFiles, t],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
    setStatus("idle");
  }, []);

  return {
    status,
    directory,
    progress,
    outcome,
    start,
    cancel,
  };
}
