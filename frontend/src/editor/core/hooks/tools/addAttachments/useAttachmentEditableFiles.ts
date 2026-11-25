import { useEffect, useMemo, useState } from "react";
import { useRightsManagedPdfRevision } from "@editor/hooks/useRightsManagedPdf";
import {
  getOpenedRightsManagedPdf,
  isMicrosoftProtectedPdf,
} from "@editor/services/rightsManagedPdf";
import { rightsManagedToolAccepts } from "@editor/services/rightsManagedTools";
import type { StirlingFile } from "@editor/types/fileContext";

const SAVE_ENDPOINT = "/api/v1/misc/batch-process-attachments";

export function useAttachmentEditableFiles(
  files: StirlingFile[],
): StirlingFile[] {
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
      files.filter((file) =>
        getOpenedRightsManagedPdf(file)
          ? rightsManagedToolAccepts(SAVE_ENDPOINT, file.fileId)
          : withoutPurview.has(file),
      ),
    [files, withoutPurview, rightsRevision],
  );
}
