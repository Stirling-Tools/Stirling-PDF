/**
 * Hybrid XFA forms (as Adobe LiveCycle saves them) carry their fields twice: as AcroForm fields,
 * which every viewer but Acrobat shows, and as XFA, which Acrobat shows instead. This module
 * detects them in the browser and names the modes a save can apply to the XFA half.
 */
import { useEffect, useState } from "react";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentSafe,
} from "@app/services/pdfiumService";

/**
 * Opening a document copies all of it into wasm memory. No LiveCycle form is anywhere near this
 * size, and it matches the limit above which the app never parses a whole PDF client-side.
 */
const MAX_PROBE_BYTES = 100 * 1024 * 1024;

export type XfaMode = "sync" | "strip" | "none";
export type XfaKind = "none" | "hybrid" | "dynamic";

/** PDFium's FORMTYPE_XFA_FULL (the catalog sets NeedsRendering) and FORMTYPE_XFA_FOREGROUND. */
const FORM_TYPE_XFA_FULL = 2;
const FORM_TYPE_XFA_FOREGROUND = 3;

/**
 * XFA without any AcroForm field counts as dynamic, as the backend treats it: there is nothing but
 * the XFA to fill, and only Acrobat can fill that.
 */
export function classifyXfa(formType: number, fieldCount: number): XfaKind {
  if (formType === FORM_TYPE_XFA_FULL) return "dynamic";
  if (formType === FORM_TYPE_XFA_FOREGROUND) {
    return fieldCount > 0 ? "hybrid" : "dynamic";
  }
  return "none";
}

const formTypes = new WeakMap<Blob, Promise<number>>();

/** FPDF_GetFormType of a document, read once per Blob; 0 whenever PDFium cannot answer. */
export function readFormType(file: Blob): Promise<number> {
  const known = formTypes.get(file);
  if (known) return known;
  const pending = probeFormType(file);
  formTypes.set(file, pending);
  return pending;
}

async function probeFormType(file: Blob): Promise<number> {
  if (file.size >= MAX_PROBE_BYTES) return 0;
  try {
    const m = await getPdfiumModule();
    if (typeof m.FPDF_GetFormType !== "function") return 0;
    const docPtr = await openRawDocumentSafe(await file.arrayBuffer());
    try {
      return m.FPDF_GetFormType(docPtr);
    } finally {
      closeDocAndFreeBuffer(m, docPtr);
    }
  } catch {
    return 0;
  }
}

/** The XFA kind of `file`, reported as "none" until the check for that file has finished. */
export function useXfaKind(
  file: Blob | null | undefined,
  fieldCount: number,
): XfaKind {
  const [detected, setDetected] = useState<{
    file: Blob;
    formType: number;
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
