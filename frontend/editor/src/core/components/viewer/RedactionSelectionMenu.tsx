import {
  useRedaction as useEmbedPdfRedaction,
  RedactionSelectionMenuProps,
} from "@embedpdf/plugin-redaction/react";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useRef, useCallback } from "react";
import { Icon } from "@app/ui/Icon";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import { useAnchoredOverlay } from "@app/hooks/useAnchoredOverlay";
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
  const { handleToolSelect } = useToolWorkflow();
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // This menu is scoped to one pending mark, so it only offers actions that
  // affect that mark. Applying is permanent and applies *every* pending mark, so
  // it lives in the redaction review panel where that scope is visible.
  const onReviewPanel = useCallback(() => {
    handleToolSelect("redact");
  }, [handleToolSelect]);

  const { overlayRef, mounted } = useAnchoredOverlay({
    anchorRef: wrapperRef,
    enabled: Boolean(selected && isRedaction && item),
  });

  // Early return AFTER all hooks have been called
  if (!selected || !isRedaction || !item) return null;

  const menuContent = mounted ? (
    <div
      ref={overlayRef}
      data-redaction-selection-menu
      className="embedpdf-floating-menu"
      style={{
        position: "fixed",
        // top/left are owned by useAnchoredOverlay; see the note there.
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
          "viewer.redaction.reviewAll",
          "Review and apply all redactions in the tool panel",
        )}
        withArrow
      >
        <button
          type="button"
          className="embedpdf-floating-btn"
          onClick={onReviewPanel}
          aria-label={t(
            "viewer.redaction.reviewAll",
            "Review and apply all redactions in the tool panel",
          )}
        >
          <Icon name="list" size={18} />
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
