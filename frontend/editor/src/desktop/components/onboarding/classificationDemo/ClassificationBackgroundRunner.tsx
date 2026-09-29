/** Headless: drives the background sweep the results view asked for. Mounted once inside
 *  the file and folder providers, which the sweep needs and the rail does not have. */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFolders } from "@app/contexts/FolderContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import {
  claimBackgroundClassification,
  finishBackgroundClassification,
  reportBackgroundClassificationProgress,
  useBackgroundClassification,
} from "@app/components/onboarding/classificationDemo/backgroundClassification";
import { runClassificationDemoSweep } from "@app/components/onboarding/classificationDemo/classificationDemoSweep";

export function ClassificationBackgroundRunner() {
  const { t } = useTranslation();
  const { mountLocalFolder } = useFolders();
  const { addFiles } = useFileHandler();
  const job = useBackgroundClassification();
  const unmounted = useRef(false);

  // Reset on mount, not just set on cleanup: StrictMode runs mount → cleanup → mount on
  // the same ref, and a flag only ever set true would cancel every sweep before its
  // first document.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const requested = job?.status === "requested";
  useEffect(() => {
    if (!requested) return;
    const claimed = claimBackgroundClassification();
    if (!claimed) return;
    const base = claimed.processed;
    // Same sweep as the onboarding batch, so the same heuristic-only path and the same
    // locked verdicts: nothing here is new ground for the AI guard to cover.
    void runClassificationDemoSweep(
      claimed.directory,
      {
        mountFolder: mountLocalFolder,
        addFiles,
        onProgress: (progress) =>
          reportBackgroundClassificationProgress(base, progress.processed),
        isCancelled: () => unmounted.current,
      },
      {
        limit: claimed.limit,
        exclude: claimed.exclude,
        unclassifiedName: t("classificationDemo.groups.other", "Other"),
      },
    )
      .finally(finishBackgroundClassification)
      // An unreadable folder ends the job; the ring shows whatever was done before.
      .catch(() => undefined);
  }, [requested, mountLocalFolder, addFiles, t]);

  return null;
}
