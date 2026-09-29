import { clampRenderScale } from "@app/tools/pdfTextEditor/util/fitToWidth";

/** Reading position carried from the normal viewer into the text editor. */
export interface TextEditorViewerHandoff {
  fileId: string | null;
  fileKey: string | null;
  /** Effective viewer zoom (currentZoom), directly usable as renderScale. */
  zoomScale: number;
  /** 1-based page number. */
  page: number;
  /** Fraction down the page (0-1); scale-independent, survives the zoom change. */
  offsetFraction: number;
  capturedAt: number;
}

export interface PendingEditorScroll {
  page: number;
  offsetFraction: number;
}

const HANDOFF_TTL_MS = 5 * 60 * 1000;

let handoff: TextEditorViewerHandoff | null = null;
let pendingScroll: PendingEditorScroll | null = null;

/** Publish the viewer's current position for the next editor open. */
export function captureTextEditorHandoff(
  next: Omit<TextEditorViewerHandoff, "capturedAt">,
): void {
  if (!Number.isFinite(next.zoomScale) || next.page < 1) return;
  handoff = {
    ...next,
    zoomScale: clampRenderScale(next.zoomScale),
    offsetFraction: Math.min(1, Math.max(0, next.offsetFraction || 0)),
    capturedAt: Date.now(),
  };
}

function peek(): TextEditorViewerHandoff | null {
  if (!handoff) return null;
  if (Date.now() - handoff.capturedAt > HANDOFF_TTL_MS) {
    handoff = null;
    return null;
  }
  return handoff;
}

/** Handoff for this file, or null when the capture belongs elsewhere. */
export function matchTextEditorHandoff(
  fileId?: string | null,
  fileKey?: string | null,
): TextEditorViewerHandoff | null {
  const h = peek();
  if (!h) return null;
  if (fileId && h.fileId && fileId === h.fileId) return h;
  if (fileKey && h.fileKey && fileKey === h.fileKey) return h;
  return null;
}

/** Identity key matching useAutoLoadFile's fileKey. */
export function handoffFileKey(file: File): string {
  const f = file as File & { fileId?: string; quickKey?: string };
  return f.fileId ?? f.quickKey ?? `${f.name}|${f.size}|${f.lastModified}`;
}

/** Stable workbench id when the file came from there, else null. */
export function handoffFileId(file: File): string | null {
  const f = file as File & { fileId?: string };
  return typeof f.fileId === "string" ? f.fileId : null;
}

/** Stash the scroll target the loader matched so the stage can apply it. */
export function stagePendingEditorScroll(
  next: PendingEditorScroll | null,
): void {
  pendingScroll = next;
}

/** Take the stashed scroll target exactly once. */
export function takePendingEditorScroll(): PendingEditorScroll | null {
  const next = pendingScroll;
  pendingScroll = null;
  return next;
}
