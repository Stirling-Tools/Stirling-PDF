import { useEffect, useRef, useState } from "react";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";

interface MarqueeSelectorProps {
  store: EditorStore;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Pressing on these keeps their own gesture (edit, move, resize, guide drag),
// so a plain drag only becomes a marquee when it starts on bare page or gutter.
const OWN_GESTURE_SELECTOR = [
  '[data-testid^="pdf-editor-run-"]',
  '[data-testid^="pdf-editor-image-"]',
  '[data-testid^="pdf-editor-shape-"]',
  '[data-testid^="pdf-editor-ruler"]',
  '[data-testid^="pdf-editor-guide-"]',
  "button",
  "input",
  "textarea",
  "[contenteditable='true']",
].join(", ");

/**
 * Rectangle-select on the page stack, selecting every text run, image and
 * shape it touches. A plain drag from bare page starts one, Shift extends the
 * current selection, and Ctrl/Cmd+Shift starts one from anywhere, including
 * over text, to override line/paragraph auto-grouping when it gets the
 * structure wrong.
 */
export function MarqueeSelector({ store }: MarqueeSelectorProps) {
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const liveRectRef = useRef<MarqueeRect | null>(null);
  const additiveRef = useRef(false);

  useEffect(() => {
    function setLiveRect(next: MarqueeRect | null) {
      liveRectRef.current = next;
      setRect(next);
    }
    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-testid="pdf-editor-pages"]')) return;
      const forced = (e.ctrlKey || e.metaKey) && e.shiftKey;
      if (forced) {
        e.preventDefault();
      } else {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (store.getState().mode !== "select") return;
        if (target.closest(OWN_GESTURE_SELECTOR)) return;
      }
      additiveRef.current = !forced && e.shiftKey;
      startRef.current = { x: e.clientX, y: e.clientY };
      // Without this, dragging across text runs paints a native text
      // selection under the rectangle.
      document.body.style.userSelect = "none";
      setLiveRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    }
    function onPointerMove(e: PointerEvent) {
      const origin = startRef.current;
      if (!origin) return;
      const left = Math.min(origin.x, e.clientX);
      const top = Math.min(origin.y, e.clientY);
      const width = Math.abs(e.clientX - origin.x);
      const height = Math.abs(e.clientY - origin.y);
      setLiveRect({ left, top, width, height });
    }
    function onPointerUp() {
      const r = liveRectRef.current;
      const origin = startRef.current;
      startRef.current = null;
      setLiveRect(null);
      if (!origin) return;
      document.body.style.userSelect = "";
      if (!r || (r.width < 3 && r.height < 3)) return;
      const runIds = collectIdsInRect(r, "pdf-editor-run-");
      const imageIds = collectIdsInRect(r, "pdf-editor-image-");
      const shapeIds = collectIdsInRect(r, "pdf-editor-shape-");
      // A rectangle that caught nothing leaves the selection alone rather than
      // silently wiping it.
      if (runIds.length + imageIds.length + shapeIds.length === 0) return;
      store.selection.selectMany(
        runIds,
        additiveRef.current,
        imageIds,
        shapeIds,
      );
    }
    function onPointerCancel() {
      if (!startRef.current) return;
      startRef.current = null;
      setLiveRect(null);
      document.body.style.userSelect = "";
    }
    // Pointer events cover mouse, pen and touch with one code path.
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      document.body.style.userSelect = "";
    };
  }, [store]);

  if (!rect) return null;
  return (
    <div
      data-testid="pdf-editor-marquee"
      style={{
        position: "fixed",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        border: "1px dashed #2c7be5",
        background: "rgba(44, 123, 229, 0.08)",
        pointerEvents: "none",
        zIndex: 300,
      }}
    />
  );
}

function collectIdsInRect(rect: MarqueeRect, testIdPrefix: string): string[] {
  const pages = document.querySelector('[data-testid="pdf-editor-pages"]');
  if (!pages) return [];
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const ids: string[] = [];
  const elements = pages.querySelectorAll<HTMLElement>(
    `[data-testid^="${testIdPrefix}"]`,
  );
  for (const el of elements) {
    const id = el.dataset.testid?.slice(testIdPrefix.length);
    if (!id) continue;
    const b = el.getBoundingClientRect();
    const intersects =
      b.right >= rect.left &&
      b.left <= right &&
      b.bottom >= rect.top &&
      b.top <= bottom;
    if (intersects) ids.push(id);
  }
  return ids;
}
