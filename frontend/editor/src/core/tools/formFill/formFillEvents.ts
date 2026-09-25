/** Hands a produced PDF blob to EmbedPdfViewer, which reloads the file preserving scroll/rotation. */
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
