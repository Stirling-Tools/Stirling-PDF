import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useHistoryCapability } from "@embedpdf/plugin-history/react";
import { Icon } from "@app/ui/Icon";
import type { AnnotationMenuAnchor } from "@app/components/viewer/viewerTypes";
import "@app/components/viewer/TextSelectionMenu.css";

interface AnnotationDeletedMenuProps {
  anchor: AnnotationMenuAnchor | null;
  onDismiss: () => void;
}

/**
 * Undo affordance for a just-deleted annotation, rendered where its selection
 * menu sat so the delete stays recoverable without leaving the page.
 */
export function AnnotationDeletedMenu({
  anchor,
  onDismiss,
}: AnnotationDeletedMenuProps) {
  const { t } = useTranslation();
  const { provides: annotationApi } = useAnnotationCapability();
  const { provides: historyApi } = useHistoryCapability();

  useEffect(() => {
    if (!anchor) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-annotation-deleted-menu]")) return;
      onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchor, onDismiss]);

  const handleUndo = useCallback(() => {
    if (!anchor) return;
    historyApi?.undo();
    // The history replay is asynchronous, so wait for the annotation to exist
    // again before re-selecting it and letting the normal menu take over.
    let attempts = 0;
    const selectRestored = () => {
      if (annotationApi?.getAnnotationById(anchor.annotationId)) {
        annotationApi.selectAnnotation(anchor.pageIndex, anchor.annotationId);
        onDismiss();
        return;
      }
      attempts += 1;
      if (attempts < 20) {
        setTimeout(selectRestored, 50);
      } else {
        onDismiss();
      }
    };
    setTimeout(selectRestored, 50);
  }, [anchor, annotationApi, historyApi, onDismiss]);

  if (!anchor) return null;

  return createPortal(
    <div
      data-annotation-deleted-menu
      className="embedpdf-floating-menu"
      style={{
        position: "fixed",
        top: `${anchor.top}px`,
        left: `${anchor.left}px`,
        transform: "translateX(-50%)",
        pointerEvents: "auto",
        zIndex: 10000,
      }}
    >
      <span>{t("annotation.deleted", "Annotation deleted")}</span>
      <button
        type="button"
        className="embedpdf-floating-btn"
        onClick={handleUndo}
        aria-label={t("annotation.undoDelete", "Undo")}
      >
        <Icon name="undo-2" size={18} />
      </button>
    </div>,
    document.body,
  );
}
