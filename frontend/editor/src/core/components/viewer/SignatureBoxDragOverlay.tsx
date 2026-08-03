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
  /** True once the pointer has moved far enough to read the gesture as a drag. */
  moved: boolean;
}

/** A box smaller than this is a misfire rather than an intended area. */
const MIN_BOX_PX = 8;

/** Movement below this still counts as a click, so a shaky hand does not lose the corner. */
const DRAG_THRESHOLD_PX = 4;

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
  /** First corner of a two-click placement, once the user has clicked it. */
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Page size in PDF points. Read lazily: pages are only measured once placement
  // starts, so viewing a document costs nothing.
  const pageSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const start = () => setIsActive(true);
    const cancel = () => {
      setIsActive(false);
      setDrag(null);
      setAnchor(null);
      setHover(null);
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

  /** Turns a finished rectangle in CSS pixels into the request's PDF points. */
  const emit = useCallback(
    async (left: number, top: number, width: number, height: number) => {
      if (width < MIN_BOX_PX || height < MIN_BOX_PX) return false;

      const size = await readPageSize();
      if (!size) return false;

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
      setAnchor(null);
      return true;
    },
    [pageWidth, pageHeight, pageIndex, readPageSize],
  );

  /**
   * Pointer capture is what stops the viewer from panning mid-gesture: without it the
   * viewer keeps receiving the move events and scrolls the page out from under the
   * box being drawn.
   */
  const handlePointerDown = (event: React.PointerEvent) => {
    if (!isActive || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const { x, y } = pointIn(event);

    // Second click of a two-click placement closes the box.
    if (anchor) {
      void emit(
        Math.min(anchor.x, x),
        Math.min(anchor.y, y),
        Math.abs(x - anchor.x),
        Math.abs(y - anchor.y),
      );
      return;
    }

    setDrag({ startX: x, startY: y, currentX: x, currentY: y, moved: false });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isActive) return;
    const { x, y } = pointIn(event);

    // With an anchor set, the box follows the pointer so the user sees the shape the
    // second click will produce.
    if (anchor && !drag) {
      setHover({ x, y });
      return;
    }
    if (!drag) return;

    event.preventDefault();
    const moved =
      drag.moved ||
      Math.abs(x - drag.startX) > DRAG_THRESHOLD_PX ||
      Math.abs(y - drag.startY) > DRAG_THRESHOLD_PX;
    setDrag({ ...drag, currentX: x, currentY: y, moved });
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!isActive || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const current = drag;
    setDrag(null);

    // Released without really moving: treat it as the first of two clicks rather than
    // discarding it, so both gestures work and a stalled drag is not a dead end.
    if (!current.moved) {
      setAnchor({ x: current.startX, y: current.startY });
      setHover({ x: current.startX, y: current.startY });
      return;
    }

    void emit(
      Math.min(current.startX, current.currentX),
      Math.min(current.startY, current.currentY),
      Math.abs(current.currentX - current.startX),
      Math.abs(current.currentY - current.startY),
    );
  };

  if (!isActive) return null;

  // While dragging the box follows the pointer; after the first of two clicks it
  // follows the hover position, so both gestures preview the same way.
  const corners = drag
    ? { a: { x: drag.startX, y: drag.startY }, b: { x: drag.currentX, y: drag.currentY } }
    : anchor && hover
      ? { a: anchor, b: hover }
      : null;

  const box = corners
    ? {
        left: Math.min(corners.a.x, corners.b.x),
        top: Math.min(corners.a.y, corners.b.y),
        width: Math.abs(corners.b.x - corners.a.x),
        height: Math.abs(corners.b.y - corners.a.y),
      }
    : null;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 12,
        cursor: "crosshair",
        // Stops the viewer treating the gesture as a pan, and stops the browser
        // selecting page text while the box is being drawn.
        touchAction: "none",
        userSelect: "none",
        // A faint wash marks which pages are drawable without hiding the content
        // the user is aiming at.
        backgroundColor: "rgba(59, 130, 246, 0.06)",
      }}
      data-signature-drag-page={pageIndex}
    >
      {box && (box.width > 0 || box.height > 0) && (
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

      {/* The first corner stays visible so it is obvious a second click is expected. */}
      {anchor && !drag && (
        <div
          style={{
            position: "absolute",
            left: anchor.x - 4,
            top: anchor.y - 4,
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "var(--mantine-color-blue-6, #228be6)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};

export default SignatureBoxDragOverlay;
