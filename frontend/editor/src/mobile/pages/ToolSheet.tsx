import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "@app/pages/ToolSheet.css";

interface ToolSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

const DISMISS_DRAG_PX = 80;

/**
 * Bottom sheet that holds the tool panel over the document. The content stays
 * mounted while closed so a tool's settings survive dismissing the sheet.
 */
export function ToolSheet({ open, onClose, children }: ToolSheetProps) {
  const { t } = useTranslation();
  const dragStart = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const endDrag = () => {
    if (dragOffset > DISMISS_DRAG_PX) onClose();
    dragStart.current = null;
    setDragOffset(0);
  };

  return (
    <>
      <div
        className="tool-sheet-scrim"
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />
      <section
        className="tool-sheet"
        data-open={open}
        data-dragging={dragStart.current !== null}
        style={
          dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined
        }
        aria-label={t("mobile.tools.sheet", "Tools")}
        aria-hidden={!open}
        inert={!open}
      >
        <button
          type="button"
          className="tool-sheet-handle"
          aria-label={t("mobile.tools.close", "Close tools")}
          onClick={onClose}
          onPointerDown={(event) => {
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            setDragOffset(Math.max(0, event.clientY - dragStart.current));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="tool-sheet-grabber" />
        </button>
        <div className="tool-sheet-body">{children}</div>
      </section>
    </>
  );
}
