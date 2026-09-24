import { useEffect, useState } from "react";
import { readDir } from "@tauri-apps/plugin-fs";
import type { DownloadsProcessing } from "@core/hooks/useDownloadsProcessing";
export type { DownloadsProcessing };
import {
  startClassificationDemo,
  useClassificationDemoHasRun,
} from "@app/components/onboarding/classificationDemo/classificationDemoSession";
import {
  CLASSIFICATION_DEMO_BATCH_SIZE,
  resolveDownloadsDirectory,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";

/** Offers the Downloads demo only before its first run and after confirming directory access. */
export function useDownloadsProcessing(): DownloadsProcessing | null {
  const hasRun = useClassificationDemoHasRun();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (hasRun) return;
    let cancelled = false;
    void resolveDownloadsDirectory()
      .then(async (directory) => {
        if (!directory || cancelled) return;
        await readDir(directory);
        if (!cancelled) setAvailable(true);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasRun]);

  return available && !hasRun
    ? {
        count: CLASSIFICATION_DEMO_BATCH_SIZE,
        start: () => startClassificationDemo(CLASSIFICATION_DEMO_BATCH_SIZE),
      }
    : null;
}
