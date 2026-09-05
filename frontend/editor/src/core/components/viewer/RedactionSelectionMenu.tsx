import {
  useRedaction as useEmbedPdfRedaction,
  RedactionSelectionMenuProps,
} from "@embedpdf/plugin-redaction/react";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useRedaction } from "@app/contexts/RedactionContext";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import "@app/components/viewer/TextSelectionMenu.css";

export type { RedactionSelectionMenuProps };

export function RedactionSelectionMenu(props: any) {
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
  const item =
    context?.type === "redaction"
      ? context.item
      : context?.type === "annotation"
        ? (context as any).annotation?.object
        : null;

  const isRedaction =
    context?.type === "redaction" ||
    (context?.type === "annotation" &&
      item?.type === PdfAnnotationSubtype.REDACT);

  const pageIndex = context?.pageIndex;
  const { t } = useTranslation();
  const { provides } = useEmbedPdfRedaction(documentId);
  const { setRedactionsApplied } = useRedaction();
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

  const handleApply = useCallback(() => {
    if (provides?.commitPending && item && pageIndex !== undefined) {
      provides.commitPending(pageIndex, item.id);
      // Mark redactions as applied (but not yet saved) so the Save Changes button stays enabled
      // This ensures the button doesn't become disabled when pendingCount decreases
      setRedactionsApplied(true);
    }
  }, [provides, item, pageIndex, setRedactionsApplied]);

  // Calculate position for portal based on wrapper element
  useEffect(() => {
    if (!selected || !isRedaction || !item || !wrapperRef.current) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        setMenuPosition(null);
        return;
      }

      const wrapperRect = wrapper.getBoundingClientRect();
      // Position menu below the wrapper, centered
      // Use getBoundingClientRect which gives viewport-relative coordinates
      // Since we're using fixed positioning in the portal, we don't need to add scroll offsets
      setMenuPosition({
        top: wrapperRect.bottom + 8,
        left: wrapperRect.left + wrapperRect.width / 2,
      });
    };

    updatePosition();

    // Update position on scroll/resize
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [selected, item]);

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
          <DeleteIcon style={{ fontSize: 18 }} />
        </button>
      </Tooltip>

      <div className="embedpdf-floating-divider" />

      <Tooltip
        label={t(
          "redact.manual.applyWarning",
          "⚠️ Permanent application, cannot be undone and the data underneath will be deleted",
        )}
        withArrow
        position="top"
      >
        <button
          type="button"
          className="embedpdf-floating-badge-btn"
          onClick={handleApply}
        >
          <CheckCircleIcon style={{ fontSize: 16 }} />
          <span>{t("redact.manual.apply", "Apply")}</span>
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
