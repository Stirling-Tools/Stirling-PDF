/**
 * Hybrid XFA forms (as Adobe LiveCycle saves them) carry their fields twice: as AcroForm fields,
 * which every viewer but Acrobat shows, and as XFA, which Acrobat shows instead. This module
 * detects them in the browser and names the modes a save can apply to the XFA half.
 */
import { useEffect, useState } from "react";
import { getDocumentBytes } from "@app/services/documentBytesCache";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";
import { readRawFormType } from "@app/services/pdfiumService";

/**
 * Opening a document copies all of it into wasm memory. No LiveCycle form is anywhere near this
 * size, and it matches the limit above which the app never parses a whole PDF client-side.
 */
const MAX_PROBE_BYTES = 100 * 1024 * 1024;

export type XfaMode = "sync" | "strip" | "none";
/** unknown: PDFium could not answer, so the document may still be an XFA form. */
export type XfaKind = "none" | "hybrid" | "dynamic" | "unknown";

/** PDFium's FORMTYPE_XFA_FULL (the catalog sets NeedsRendering) and FORMTYPE_XFA_FOREGROUND. */
const FORM_TYPE_XFA_FULL = 2;
const FORM_TYPE_XFA_FOREGROUND = 3;

/**
 * XFA without any AcroForm field counts as dynamic, as the backend treats it: there is nothing but
 * the XFA to fill, and only Acrobat can fill that.
 */
export function classifyXfa(
  formType: number | null,
  fieldCount: number,
): XfaKind {
  if (formType === null) return "unknown";
  if (formType === FORM_TYPE_XFA_FULL) return "dynamic";
  if (formType === FORM_TYPE_XFA_FOREGROUND) {
    return fieldCount > 0 ? "hybrid" : "dynamic";
  }
  return "none";
}

const formTypes = new WeakMap<Blob, Promise<number | null>>();

/**
 * FPDF_GetFormType of a document, read once per Blob. Null when PDFium could not answer; that is
 * not remembered, so the next call asks again instead of taking the failure for "no XFA".
 */
export function readFormType(file: Blob): Promise<number | null> {
  const known = formTypes.get(file);
  if (known) return known;
  const pending = probeFormType(file);
  formTypes.set(file, pending);
  void pending.then((formType) => {
    if (formType === null && formTypes.get(file) === pending) {
      formTypes.delete(file);
    }
  });
  return pending;
}

async function probeFormType(file: Blob): Promise<number | null> {
  // An answer, not a failed check: no LiveCycle form comes near the limit.
  if (file.size >= MAX_PROBE_BYTES) return 0;
  try {
    // The viewer's copy of the bytes and its one-at-a-time scan queue: wasm
    // memory never shrinks, so a second open of the document stays paid for.
    const bytes = await getDocumentBytes(file);
    return await runPdfiumScan(() => readRawFormType(bytes));
  } catch {
    return null;
  }
}

/** The XFA kind of `file`, reported as "none" until the check for that file has finished. */
export function useXfaKind(
  file: Blob | null | undefined,
  fieldCount: number,
): XfaKind {
  const [detected, setDetected] = useState<{
    file: Blob;
    formType: number | null;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    let current = true;
    void readFormType(file).then((formType) => {
      if (current) setDetected({ file, formType });
    });
    return () => {
      current = false;
    };
  }, [file]);

  if (!file || detected?.file !== file) return "none";
  return classifyXfa(detected.formType, fieldCount);
}

/** The parts of the POST /api/v1/form/xfa-sync report the editor uses. */
export interface XfaSyncSummary {
  action: string;
  usageRightsRemoved: boolean;
  counts: Record<string, number>;
  warnings: string[];
}
