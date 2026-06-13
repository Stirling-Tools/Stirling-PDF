/**
 * The custom event the form tools use to hand a freshly-produced PDF blob to
 * the viewer (EmbedPdfViewer listens for it and reloads the file, preserving
 * scroll/rotation). Centralised so the event name isn't duplicated as a string
 * across the fill/create/modify flows.
 */
export const FORM_APPLY_EVENT = "formfill:apply";

export interface FormApplyDetail {
  blob: Blob;
}

/** Dispatch a produced PDF blob to the viewer for reload + refresh. */
export function dispatchFormApply(blob: Blob): void {
  window.dispatchEvent(
    new CustomEvent<FormApplyDetail>(FORM_APPLY_EVENT, { detail: { blob } }),
  );
}
