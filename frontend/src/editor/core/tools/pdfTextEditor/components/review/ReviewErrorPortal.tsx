import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import "@editor/tools/pdfTextEditor/components/review/review.css";

/**
 * Lifts the editor's error out of its hidden container during a review, so a
 * failed open or save shows even when no document is loaded.
 */
export function ReviewErrorPortal({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return <>{children}</>;
  return createPortal(
    <div className="review-error">{children}</div>,
    document.body,
  );
}
