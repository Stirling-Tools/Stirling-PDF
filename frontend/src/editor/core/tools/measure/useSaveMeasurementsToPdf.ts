import { useCallback, useState } from "react";
import { useMeasurements } from "@editor/contexts/MeasurementContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import {
  useAllFiles,
  useFileContext,
  useFileSelectors,
} from "@editor/contexts/FileContext";
import { createStirlingFilesAndStubs } from "@editor/services/fileStubHelpers";
import { formatMeasurementValue } from "@editor/utils/measurementUtils";
import { drawMeasurementsIntoPdf } from "@editor/tools/measure/measurementDrawing";

/**
 * Draws the current file's measurements into a new version of the PDF, then
 * clears them from the overlay so they are not shown twice.
 * Resolves to the number saved; throws if the file cannot be written
 * (EncryptedPdfError for a password-protected PDF), leaving them in place.
 */
export function useSaveMeasurementsToPdf() {
  const {
    fileKey,
    measurements,
    settings,
    scaleFor,
    clearMeasurementsFor,
    copyScalesTo,
  } = useMeasurements();
  const { exportActions } = useViewer();
  const selectors = useFileSelectors();
  const { actions } = useFileContext();
  const [isSaving, setIsSaving] = useState(false);

  const { fileIds } = useAllFiles();
  const fileId = fileIds.find((id) => id === fileKey);
  const canSave = Boolean(fileId) && measurements.length > 0;

  const save = useCallback(async (): Promise<number> => {
    const stub = fileId ? selectors.getStirlingFileStub(fileId) : undefined;
    const file = fileId ? selectors.getFile(fileId) : undefined;
    if (!fileId || !stub || !file) {
      throw new Error("No file is open in the viewer");
    }

    setIsSaving(true);
    try {
      // The viewer's copy carries annotation edits not yet saved to the file.
      const sourceBytes =
        (await exportActions.saveAsCopy().catch(() => null)) ??
        (await file.arrayBuffer());
      const pdfBytes = await drawMeasurementsIntoPdf(
        sourceBytes,
        measurements.map((measurement) => {
          const scale = scaleFor(measurement);
          const value = formatMeasurementValue(measurement, scale, settings);
          return {
            measurement,
            text: measurement.label ? `${measurement.label}: ${value}` : value,
            color: measurement.color ?? settings.defaultColor,
            strokeWidth: measurement.strokeWidth ?? settings.defaultStrokeWidth,
          };
        }),
      );
      const output = new File([pdfBytes.slice()], file.name, {
        type: "application/pdf",
      });
      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [output],
        stub,
        "measure",
      );
      const count = measurements.length;
      await actions.consumeFiles([fileId], stirlingFiles, stubs);
      // Only once the new version is stored: until then the measurements are
      // the only copy of the user's work. By now the viewer may have moved to
      // the new version, so clear the old file's by key.
      stirlingFiles.forEach((saved) => copyScalesTo(saved.fileId));
      clearMeasurementsFor(fileId);
      return count;
    } finally {
      setIsSaving(false);
    }
  }, [
    actions,
    clearMeasurementsFor,
    copyScalesTo,
    exportActions,
    fileId,
    measurements,
    scaleFor,
    selectors,
    settings,
  ]);

  return { save, canSave, isSaving };
}
