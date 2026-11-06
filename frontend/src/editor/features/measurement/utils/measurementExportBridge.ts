import { embedMeasurementsInPdf } from "./measurementPdfStorage";
import type { Measurement, PageScaleInfo } from "./measurementTypes";
import type { MeasurementGroup } from "./measurementRows";

export type MeasurementExportSnapshot = {
  measurements: Measurement[];
  groups: MeasurementGroup[];
  pageScales: Array<[number, PageScaleInfo]>;
};

type ActiveMeasurementDocument = {
  fileId: string | null;
  filename: string;
  snapshot: MeasurementExportSnapshot;
};

// The viewer owns this snapshot. The export service consumes it, not the other way around.
let activeDocument: ActiveMeasurementDocument | null = null;

export function setActiveMeasurementExport(
  fileId: string | null,
  filename: string,
  snapshot: MeasurementExportSnapshot,
): void {
  activeDocument = { fileId, filename, snapshot };
}

export function clearActiveMeasurementExport(fileId: string | null): void {
  if (activeDocument?.fileId === fileId) activeDocument = null;
}

export async function includeMeasurementsInExport(
  data: Blob | File,
  filename: string,
  fileId?: string,
): Promise<Blob | File> {
  const current = activeDocument;
  if (!current || !filename.toLowerCase().endsWith(".pdf")) return data;
  // An explicit file ID is authoritative; never attach one document's marks to another.
  if (fileId && current.fileId !== fileId) return data;
  // For exports without an ID, only the currently viewed document may be augmented.
  if (!fileId && filename !== current.filename) return data;
  const bytes = await embedMeasurementsInPdf(await data.arrayBuffer(), current.snapshot);
  return data instanceof File
    ? new File([bytes], data.name, { type: "application/pdf", lastModified: data.lastModified })
    : new Blob([bytes], { type: "application/pdf" });
}
