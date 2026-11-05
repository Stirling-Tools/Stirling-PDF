/** Hands a produced PDF blob to EmbedPdfViewer, which reloads the file preserving scroll/rotation. */
export const FORM_APPLY_EVENT = "formfill:apply";

export interface FormApplyDetail {
  blob: Blob;
  complete: (application: Promise<void>) => void;
}

/** Resolves after the viewer has stored the PDF, replaced it and refreshed its fields. */
export function dispatchFormApply(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    let handled = false;
    window.dispatchEvent(
      new CustomEvent<FormApplyDetail>(FORM_APPLY_EVENT, {
        detail: {
          blob,
          complete: (application) => {
            handled = true;
            application.then(resolve, reject);
          },
        },
      }),
    );
    if (!handled) reject(new Error("The PDF viewer is not ready to save."));
  });
}
