import {
  useRedaction as useEmbedPdfRedaction,
  RedactionSelectionMenuProps,
} from "@embedpdf/plugin-redaction/react";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { Icon } from "@app/ui/Icon";
import { useViewer } from "@app/contexts/ViewerContext";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import { useAnimationFrameCallback } from "@app/hooks/useAnimationFrameCallback";
import "@app/components/viewer/TextSelectionMenu.css";

export type { RedactionSelectionMenuProps };

export function RedactionSelectionMenu(props: RedactionSelectionMenuProps) {
  const activeDocumentId = useActiveDocumentId();

  // Don't render until we have a valid document ID
  if (!activeDocumentId) {
    return null;
  }

  return (
    <RedactionSelectionMenuInner documentId={activeDocumentId} {...props} />
  );
}

function RedactionSelectionMenuInner({
  documentId,
  context,
  selected,
  menuWrapperProps,
}: RedactionSelectionMenuProps & { documentId: string }) {
  const item = context?.type === "redaction" ? context.item : null;

  const isRedaction = context?.type === "redaction";

  const pageIndex = context?.pageIndex;
  const { t } = useTranslation();
  const { provides } = useEmbedPdfRedaction(documentId);
  const { applyChanges } = useViewer();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Merge refs - menuWrapperProps.ref is a callback ref
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      // Call the EmbedPDF ref callback
      menuWrapperProps?.ref?.(node);
    },
    [menuWrapperProps],
  );

  const handleRemove = useCallback(() => {
    if (provides?.removePending && item && pageIndex !== undefined) {
      provides.removePending(pageIndex, item.id);
    }
  }, [provides, item, pageIndex]);

  // Applying a mark is permanent, so it also saves. This sits next to a
  // single-mark "Remove", which is why the label and warning name the wider
  // scope: commitAllPending touches every mark, not just the selected one.
  const handleApply = useCallback(async () => {
    const task = provides?.commitAllPending?.();
    if (task && typeof task.toPromise === "function") {
      await task.toPromise();
    }
    await applyChanges?.();
  }, [provides, applyChanges]);

  // Calculate position for portal based on wrapper element
  const updatePosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      setMenuPosition(null);
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    // Position menu below the wrapper, centered
    // Use getBoundingClientRect which gives viewport-relative coordinates
    // Since we're using fixed positioning in the portal, we don't need to add scroll offsets
    const top = wrapperRect.bottom + 8;
    const left = wrapperRect.left + wrapperRect.width / 2;
    setMenuPosition((prev) =>
      prev && prev.top === top && prev.left === left ? prev : { top, left },
    );
  }, []);

  const scheduleUpdatePosition = useAnimationFrameCallback(updatePosition);

  useEffect(() => {
    if (!selected || !isRedaction || !item || !wrapperRef.current) {
      setMenuPosition(null);
      return;
    }

    updatePosition();

    // Update position on scroll/resize
    window.addEventListener("scroll", scheduleUpdatePosition, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", scheduleUpdatePosition);

    return () => {
      window.removeEventListener("scroll", scheduleUpdatePosition, true);
      window.removeEventListener("resize", scheduleUpdatePosition);
    };
  }, [selected, item, updatePosition, scheduleUpdatePosition]);

  // Early return AFTER all hooks have been called
  if (!selected || !isRedaction || !item) return null;

  const menuContent = menuPosition ? (
    <div
      data-redaction-selection-menu
      className="embedpdf-floating-menu"
      style={{
        position: "fixed",
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        transform: "translateX(-50%)",
        pointerEvents: "auto",
        zIndex: 10000,
      }}
    >
      <Tooltip
        label={t("viewer.redaction.removeMark", "Remove this mark")}
        withArrow
      >
        <button
          type="button"
          className="embedpdf-floating-btn embedpdf-floating-btn-danger"
          onClick={handleRemove}
          aria-label={t("viewer.redaction.removeMark", "Remove this mark")}
        >
          <Icon name="trash" size={18} />
        </button>
      </Tooltip>

      <div className="embedpdf-floating-divider" />

      <Tooltip
        label={t(
          "viewer.redaction.applyAllPendingWarning",
          "⚠️ Applies and saves every pending mark. Permanent, cannot be undone, and the data underneath will be deleted",
        )}
        withArrow
        position="top"
      >
        <button
          type="button"
          className="embedpdf-floating-badge-btn"
          onClick={() => void handleApply()}
        >
          <Icon name="circle-check" size={16} />
          <span>
            {t("viewer.redaction.applyAllPending", "Apply All Redactions")}
          </span>
        </button>
      </Tooltip>
    </div>
  ) : null;

  return (
    <>
      {/* Invisible wrapper that provides positioning - uses EmbedPDF's menuWrapperProps */}
      <div
        ref={setRef}
        style={{
          // Use EmbedPDF's positioning styles
          ...menuWrapperProps?.style,
          // Keep the wrapper invisible but still occupying space for positioning
          opacity: 0,
          pointerEvents: "none",
        }}
      />
      {typeof document !== "undefined" && menuContent
        ? createPortal(menuContent, document.body)
        : null}
    </>
  );
}
