import { useEffect, useMemo, useState } from "react";
import { useRightsManagedPdfRevision } from "@editor/hooks/useRightsManagedPdf";
import {
  getOpenedRightsManagedPdf,
  isMicrosoftProtectedPdf,
} from "@editor/services/rightsManagedPdf";
import type { StirlingFile } from "@editor/types/fileContext";

export function useFilesWithoutPurview(files: StirlingFile[]): StirlingFile[] {
  const rightsRevision = useRightsManagedPdfRevision();
  const [withoutPurview, setWithoutPurview] = useState<
    ReadonlySet<StirlingFile>
  >(() => new Set());

  useEffect(() => {
    let cancelled = false;
    void Promise.all(files.map((file) => isMicrosoftProtectedPdf(file))).then(
      (detected) => {
        if (!cancelled)
          setWithoutPurview(
            new Set(files.filter((_, index) => !detected[index])),
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [files]);

  return useMemo(
    () =>
      files.filter(
        (file) => withoutPurview.has(file) && !getOpenedRightsManagedPdf(file),
      ),
    [files, withoutPurview, rightsRevision],
  );
}
