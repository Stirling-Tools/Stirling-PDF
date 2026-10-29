import { PDFDocument, PDFHexString, PDFName } from "@cantoo/pdf-lib";
import type { Measurement, PageScaleInfo } from "./measurementTypes";
import type { MeasurementGroup } from "./measurementRows";

/** Private catalog entry; keeps editable measurement geometry in the PDF itself. */
const CATALOG_KEY = PDFName.of("StirlingMeasurementV2");
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

export type MeasurementPayload = {
  schema: "stirling.measurements";
  version: 2;
  measurements: Measurement[];
  groups: MeasurementGroup[];
  pageScales: Array<[number, PageScaleInfo]>;
};

/** Returns a new PDF buffer. The input is never modified. */
export async function embedMeasurementsInPdf(
  bytes: ArrayBuffer,
  data: {
    measurements: Measurement[];
    groups: MeasurementGroup[];
    pageScales: Array<[number, PageScaleInfo]>;
  },
): Promise<ArrayBuffer> {
  const payload: MeasurementPayload = {
    schema: "stirling.measurements",
    version: 2,
    measurements: data.measurements,
    groups: data.groups,
    pageScales: data.pageScales,
  };
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES) {
    throw new Error("Measurement data exceeds the 8 MiB PDF storage limit");
  }
  const pdf = await PDFDocument.load(bytes);
  pdf.catalog.set(CATALOG_KEY, PDFHexString.fromText(serialized));
  const saved = await pdf.save({ useObjectStreams: false });
  return saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
}

/** Read v2 measurements without relying on localStorage. */
export async function readMeasurementPayloadFromPdf(bytes: ArrayBuffer): Promise<MeasurementPayload | null> {
  const pdf = await PDFDocument.load(bytes);
  const entry = pdf.catalog.get(CATALOG_KEY);
  if (!entry) return null;
  if (!(entry instanceof PDFHexString)) throw new Error("Invalid Stirling measurement metadata");
  const payload: unknown = JSON.parse(entry.decodeText());
  if (!payload || typeof payload !== "object") throw new Error("Invalid measurement payload");
  const data = payload as Partial<MeasurementPayload>;
  if (data.schema !== "stirling.measurements" || data.version !== 2 || !Array.isArray(data.measurements)) {
    throw new Error("Unsupported Stirling measurement payload");
  }
  return {
    schema: "stirling.measurements",
    version: 2,
    measurements: data.measurements,
    groups: Array.isArray(data.groups) ? data.groups : [],
    pageScales: Array.isArray(data.pageScales) ? data.pageScales : [],
  };
}

export async function readMeasurementsFromPdf(bytes: ArrayBuffer): Promise<Measurement[] | null> {
  return (await readMeasurementPayloadFromPdf(bytes))?.measurements ?? null;
}
