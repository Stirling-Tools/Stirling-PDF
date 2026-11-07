import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRightsManagedPdfRevision } from "@editor/hooks/useRightsManagedPdf";
import {
  getPdfAccess,
  pdfAccessRevision,
  subscribePdfAccess,
} from "@editor/services/pdfAccessService";
import {
  getOpenedRightsManagedPdf,
  isMicrosoftProtectedPdf,
} from "@editor/services/rightsManagedPdf";
import type { StirlingFile } from "@editor/types/fileContext";

export function useUnprotectedFiles(files: StirlingFile[]): StirlingFile[] {
  const accessRevision = useSyncExternalStore(
    subscribePdfAccess,
    pdfAccessRevision,
    pdfAccessRevision,
  );
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
        (file) =>
          withoutPurview.has(file) &&
          !getPdfAccess(file)?.encrypted &&
          !getOpenedRightsManagedPdf(file),
      ),
    [files, withoutPurview, accessRevision, rightsRevision],
  );
}
