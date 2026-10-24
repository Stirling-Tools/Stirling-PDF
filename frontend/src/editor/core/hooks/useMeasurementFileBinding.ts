import { useEffect } from "react";
import { useMeasurements } from "@editor/contexts/MeasurementContext";
import type { StirlingFile } from "@editor/types/fileContext";
import { isStirlingFile, getFormFillFileId } from "@editor/types/fileContext";

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
