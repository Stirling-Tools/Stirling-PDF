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

/** One viewer-rendered page covering the editor load underneath it. */
export interface EditorPoster {
  fileId: string | null;
  fileKey: string | null;
  objectUrl: string;
  /** 0-based page index the bitmap shows. */
  pageIndex: number;
}

let poster: EditorPoster | null = null;
let pendingPoster: EditorPoster | null = null;

function revokeUrl(url: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

/** Stash the viewer bitmap, dropping (and freeing) any previous one. */
export function stageEditorPoster(next: EditorPoster | null): void {
  if (poster) revokeUrl(poster.objectUrl);
  poster = next;
}

/** Take the stashed bitmap only when it shows the file being loaded. */
export function takeEditorPoster(
  fileId?: string | null,
  fileKey?: string | null,
): EditorPoster | null {
  if (!poster) return null;
  const match =
    (fileId && poster.fileId && fileId === poster.fileId) ||
    (fileKey && poster.fileKey && fileKey === poster.fileKey);
  if (!match) return null;
  const next = poster;
  poster = null;
  return next;
}

/** Drop an unmatched bitmap so it cannot leak into a later load. */
export function discardEditorPoster(): void {
  if (poster) revokeUrl(poster.objectUrl);
  poster = null;
}

/** Approved bitmap the stage may show; the loader already matched the file. */
export function stagePendingPoster(next: EditorPoster | null): void {
  if (pendingPoster) revokeUrl(pendingPoster.objectUrl);
  pendingPoster = next;
}

/** Take the approved bitmap exactly once. */
export function takePendingPoster(): EditorPoster | null {
  const next = pendingPoster;
  pendingPoster = null;
  return next;
}

/** Scroll fraction per open document, surviving a canvas remount. */
const editorScrollMemory = new WeakMap<object, number>();

/** Remember where the document was left, as a fraction so a resize between
 * visits still lands near the spot. */
export function rememberEditorScroll(doc: object, fraction: number): void {
  if (Number.isFinite(fraction)) editorScrollMemory.set(doc, fraction);
}

/** Fraction left at, or null when this document was never open here. */
export function recallEditorScroll(doc: object): number | null {
  return editorScrollMemory.get(doc) ?? null;
}
