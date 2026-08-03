import React, { useCallback, useEffect, useRef, useState } from "react";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import {
  SIGNATURE_PLACEMENT_CANCEL_EVENT,
  SIGNATURE_PLACEMENT_DONE_EVENT,
  SIGNATURE_PLACEMENT_START_EVENT,
  type SignaturePlacementResult,
} from "@app/constants/signaturePlacementEvents";

interface SignatureBoxDragOverlayProps {
  pageIndex: number;
  /** Rendered page size in CSS pixels, already zoomed by the viewer. */
  pageWidth: number;
  pageHeight: number;
  /** The document being viewed, used to read the page's size in PDF points. */
  pdfSource: File | Blob | null;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/** Ignore a stray click that drags almost nothing, which is a click, not a box. */
const MIN_DRAG_PX = 8;

/**
 * Lets the user drag a signature box directly on the page, the way Acrobat does.
 *
 * Mounted on every page of the viewer but inert until the cert-sign tool announces
 * placement mode, at which point whichever page the user drags on becomes the signed
 * page. Communication runs over window events rather than a shared context because the
 * viewer is used far from the tool, and the alternative - threading a context through
 * the whole viewer tree for one optional feature - would couple them for no gain. The
 * project already uses this pattern for the guided tour's crop handoff.
 *
 * The box is reported in PDF points with the origin bottom-left, which is what the
 * cert-sign endpoint takes, so nothing downstream has to convert again.
 */
export const SignatureBoxDragOverlay: React.FC<SignatureBoxDragOverlayProps> = ({
  pageIndex,
  pageWidth,
  pageHeight,
  pdfSource,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Page size in PDF points. Read lazily: pages are only measured once placement
  // starts, so viewing a document costs nothing.
  const pageSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const start = () => setIsActive(true);
    const cancel = () => {
      setIsActive(false);
      setDrag(null);
    };
    window.addEventListener(SIGNATURE_PLACEMENT_START_EVENT, start);
    window.addEventListener(SIGNATURE_PLACEMENT_CANCEL_EVENT, cancel);
    return () => {
      window.removeEventListener(SIGNATURE_PLACEMENT_START_EVENT, start);
      window.removeEventListener(SIGNATURE_PLACEMENT_CANCEL_EVENT, cancel);
    };
  }, []);

  // Escape gets the user out without placing anything - the expected way to back out
  // of a modal gesture, and the only one when the box has not been drawn yet.
  useEffect(() => {
    if (!isActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.dispatchEvent(new CustomEvent(SIGNATURE_PLACEMENT_CANCEL_EVENT));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive]);

  const readPageSize = useCallback(async () => {
    if (pageSizeRef.current || !pdfSource) return pageSizeRef.current;
    try {
      const buffer = await pdfSource.arrayBuffer();
      const pdf = await pdfWorkerManager.createDocument(buffer);
      try {
        const page = await pdf.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: 1 });
        pageSizeRef.current = {
          width: viewport.width,
          height: viewport.height,
        };
      } finally {
        pdfWorkerManager.destroyDocument(pdf);
      }
    } catch (error) {
      console.error("Could not read page size for signature placement:", error);
    }
    return pageSizeRef.current;
  }, [pdfSource, pageIndex]);

  useEffect(() => {
    if (isActive) void readPageSize();
  }, [isActive, readPageSize]);

  const pointIn = (event: React.MouseEvent | MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(event.clientX - rect.left, 0), pageWidth),
      y: Math.min(Math.max(event.clientY - rect.top, 0), pageHeight),
    };
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (!isActive) return;
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = pointIn(event);
    setDrag({ startX: x, startY: y, currentX: x, currentY: y });
  };

  useEffect(() => {
    if (!drag) return;

    const move = (event: MouseEvent) => {
      const { x, y } = pointIn(event);
      setDrag((prev) => (prev ? { ...prev, currentX: x, currentY: y } : prev));
    };

    const up = async () => {
      const current = drag;
      setDrag(null);
      if (!current) return;

      const left = Math.min(current.startX, current.currentX);
      const top = Math.min(current.startY, current.currentY);
      const width = Math.abs(current.currentX - current.startX);
      const height = Math.abs(current.currentY - current.startY);

      if (width < MIN_DRAG_PX || height < MIN_DRAG_PX) {
        return;
      }

      const size = await readPageSize();
      if (!size) return;

      // CSS pixels to PDF points, then flip: the viewer measures y downwards from the
      // top of the page, PDF upwards from the bottom.
      const scaleX = size.width / (pageWidth || 1);
      const scaleY = size.height / (pageHeight || 1);
      const result: SignaturePlacementResult = {
        pageNumber: pageIndex + 1,
        area: {
          x: left * scaleX,
          y: size.height - (top + height) * scaleY,
          width: width * scaleX,
          height: height * scaleY,
        },
      };

      window.dispatchEvent(
        new CustomEvent<SignaturePlacementResult>(
          SIGNATURE_PLACEMENT_DONE_EVENT,
          { detail: result },
        ),
      );
      setIsActive(false);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [drag, pageWidth, pageHeight, pageIndex, readPageSize]);

  if (!isActive) return null;

  const box = drag
    ? {
        left: Math.min(drag.startX, drag.currentX),
        top: Math.min(drag.startY, drag.currentY),
        width: Math.abs(drag.currentX - drag.startX),
        height: Math.abs(drag.currentY - drag.startY),
      }
    : null;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 12,
        cursor: "crosshair",
        // A faint wash marks which pages are drawable without hiding the content
        // the user is aiming at.
        backgroundColor: "rgba(59, 130, 246, 0.06)",
      }}
      data-signature-drag-page={pageIndex}
    >
      {box && (
        <div
          style={{
            position: "absolute",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            border: "2px solid var(--mantine-color-blue-6, #228be6)",
            backgroundColor: "rgba(34, 139, 230, 0.15)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};

export default SignatureBoxDragOverlay;
