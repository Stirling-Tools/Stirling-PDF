import { useEffect } from "react";
import { useMeasurements } from "@app/contexts/MeasurementContext";
import type { StirlingFile } from "@app/types/fileContext";
import { isStirlingFile, getFormFillFileId } from "@app/types/fileContext";

type ViewerFile = StirlingFile | File | null | undefined;

/** Points the shared measurement state at the file the viewer is showing. */
export function useMeasurementFileBinding(
  currentFile: ViewerFile,
  fileBlob: Blob | null | undefined,
): void {
  const { bindFile } = useMeasurements();
  const fileKey = !currentFile
    ? null
    : isStirlingFile(currentFile)
      ? currentFile.fileId
      : getFormFillFileId(currentFile);

  useEffect(() => {
    bindFile(fileKey, fileBlob ?? null);
  }, [bindFile, fileKey, fileBlob]);
}
