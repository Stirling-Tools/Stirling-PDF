import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "@app/pages/ToolSheet.css";

type Detent = "bar" | "half" | "full";

interface ToolSheetProps {
  open: boolean;
  /**
   * A tool is open. The sheet then docks over the document instead of covering
   * it, because tools like sign and redact go back and forth with the page.
   */
  docked: boolean;
  onClose: () => void;
  /** Bumped when the user reaches for the document; a docked sheet shrinks to its bar. */
  collapseRequest: number;
  children: ReactNode;
}

// Drag distance that moves the sheet one height up or down.
const STEP_DRAG_PX = 60;

/**
 * Bottom sheet holding the tool panel. Undocked (the tool list) it is either
 * full or closed. Docked it rests at half height with the document usable
 * above it, or shrinks to a bar showing just the tool's header (also when the
 * user touches the document); dragging down from the bar closes it. The
 * content stays mounted while closed so a tool's settings survive.
 */
export function ToolSheet({
  open,
  docked,
  onClose,
  collapseRequest,
  children,
}: ToolSheetProps) {
  const { t } = useTranslation();
  const [detent, setDetent] = useState<Detent>(docked ? "half" : "full");
  const dragStart = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  // Opening a tool from the list moves the sheet out of the document's way.
  useEffect(() => {
    if (open) setDetent(docked ? "half" : "full");
  }, [open, docked]);

  // Only a new request collapses; opening a tool after earlier touches must not.
  const handledCollapse = useRef(collapseRequest);
  useEffect(() => {
    if (collapseRequest === handledCollapse.current) return;
    handledCollapse.current = collapseRequest;
    if (docked) setDetent("bar");
  }, [collapseRequest, docked]);

  const lower = () => {
    if (!docked || detent === "bar") onClose();
    else setDetent(detent === "full" ? "half" : "bar");
  };

  const raise = () => {
    if (detent === "bar") setDetent("half");
    else setDetent("full");
  };

  const endDrag = () => {
    if (dragOffset > STEP_DRAG_PX) lower();
    else if (dragOffset < -STEP_DRAG_PX) raise();
    dragStart.current = null;
    setDragOffset(0);
  };

  const toggle = () => {
    if (detent === "full") lower();
    else raise();
  };

  const dragging = dragStart.current !== null;

  return (
    <>
      <div
        className="tool-sheet-scrim"
        data-open={open && detent === "full"}
        onClick={lower}
        aria-hidden="true"
      />
      <section
        className="tool-sheet"
        data-open={open}
        data-detent={detent}
        data-dragging={dragging}
        style={
          dragOffset
            ? { ["--tool-sheet-drag" as string]: `${dragOffset}px` }
            : undefined
        }
        aria-label={t("mobile.tools.sheet", "Tools")}
        aria-hidden={!open}
        inert={!open}
        // In the bar the first tap anywhere brings the tool back up.
        onClickCapture={
          detent === "bar"
            ? (event) => {
                event.stopPropagation();
                event.preventDefault();
                setDetent("half");
              }
            : undefined
        }
      >
        <button
          type="button"
          className="tool-sheet-handle"
          aria-label={
            detent === "full"
              ? t("mobile.tools.close", "Close tools")
              : t("mobile.tools.expand", "Expand tools")
          }
          onClick={toggle}
          onPointerDown={(event) => {
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            setDragOffset(event.clientY - dragStart.current);
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
