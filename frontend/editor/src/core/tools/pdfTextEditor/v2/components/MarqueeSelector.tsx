import { useEffect, useRef, useState } from "react";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";

interface MarqueeSelectorProps {
  store: EditorStore;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Ctrl+Shift+drag a rectangle on the page stack. Every text run whose
 * bounding box intersects the rectangle is added to the selection on
 * mouseup. Lets the user override line/paragraph auto-grouping when it
 * gets the structure wrong.
 */
export function MarqueeSelector({ store }: MarqueeSelectorProps) {
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const liveRectRef = useRef<MarqueeRect | null>(null);

  useEffect(() => {
    function setLiveRect(next: MarqueeRect | null) {
      liveRectRef.current = next;
      setRect(next);
    }
    function onPointerDown(e: PointerEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-testid="v2-pages"]')) return;
      e.preventDefault();
      startRef.current = { x: e.clientX, y: e.clientY };
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
      if (!origin || !r) return;
      if (r.width < 3 && r.height < 3) return;
      const hits = collectRunsInRect(r);
      if (hits.length === 0) return;
      store.selection.selectMany(hits);
    }
    // Pointer events cover mouse, pen and touch with one code path.
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [store]);

  if (!rect) return null;
  return (
    <div
      data-testid="v2-marquee"
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

function collectRunsInRect(rect: MarqueeRect): string[] {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const ids: string[] = [];
  const runs = document.querySelectorAll<HTMLElement>(
    '[data-testid^="v2-run-"]',
  );
  for (const el of runs) {
    const id = el.dataset.testid?.replace(/^v2-run-/, "");
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
