import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { AnnotationAPI } from "@editor/components/viewer/viewerTypes";
import { PAGE_POINTER_LAYER_CLASS } from "@editor/components/viewer/ViewerPointerProviders";

interface HintAnchor {
  layer: HTMLElement;
  /** Fractions of the page layer, so the hint stays on the point across zoom. */
  x: number;
  y: number;
}

interface MultiClickShapeHintProps {
  /** True while a polyline or polygon tool is active. */
  active: boolean;
  annotationApiRef: RefObject<AnnotationAPI | null>;
}

/**
 * Tooltip beside the first point of a polyline or polygon in progress, telling
 * the user how to finish it. Hidden once the shape is created or the tool changes.
 */
export function MultiClickShapeHint({
  active,
  annotationApiRef,
}: MultiClickShapeHintProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HintAnchor | null>(null);

  useEffect(() => {
    if (!active) {
      setAnchor(null);
      return;
    }
    // Capture phase: runs before the page layer's own listener adds the vertex.
    const onClick = (event: MouseEvent) => {
      const layer = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        `.${PAGE_POINTER_LAYER_CLASS}`,
      );
      if (!layer) return;
      setAnchor((current) => {
        if (current) return current;
        const rect = layer.getBoundingClientRect();
        return {
          layer,
          x: (event.clientX - rect.left) / rect.width,
          y: (event.clientY - rect.top) / rect.height,
        };
      });
    };
    document.addEventListener("click", onClick, true);
    const unsubscribe = annotationApiRef.current?.onAnnotationEvent?.(
      (event) => {
        if (event.type === "create") setAnchor(null);
      },
    );
    return () => {
      document.removeEventListener("click", onClick, true);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [active, annotationApiRef]);

  // The hint takes no pointer events so clicks reach the page beneath it, which
  // also means it never sees hover; track the cursor against its box instead.
  const hintRef = useRef<HTMLDivElement>(null);
  const [isUnderCursor, setIsUnderCursor] = useState(false);

  useEffect(() => {
    if (!anchor) {
      setIsUnderCursor(false);
      return;
    }
    const onPointerMove = (event: PointerEvent) => {
      const rect = hintRef.current?.getBoundingClientRect();
      setIsUnderCursor(
        !!rect &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      );
    };
    document.addEventListener("pointermove", onPointerMove, {
      capture: true,
      passive: true,
    });
    return () =>
      document.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
  }, [anchor]);

  if (!anchor || !anchor.layer.isConnected) return null;

  return createPortal(
    <div
      ref={hintRef}
      // Keeps the interaction manager from treating the hint as part of the page.
      data-no-interaction
      style={{
        opacity: isUnderCursor ? 0.15 : 1,
        transition: "opacity 120ms ease",
        position: "absolute",
        left: `${anchor.x * 100}%`,
        top: `${anchor.y * 100}%`,
        transform: "translate(12px, calc(-100% - 8px))",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 10,
        padding: "4px 8px",
        backgroundColor:
          "color-mix(in srgb, var(--c-primary) 12%, var(--c-surface))",
        color: "var(--c-text)",
        border: "1px solid var(--tooltip-border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-md)",
        fontSize: "0.75rem",
        fontWeight: 500,
      }}
    >
      {t(
        "annotation.multiClickShapeHint",
        "Double-click or press Enter to finish",
      )}
    </div>,
    anchor.layer,
  );
}
