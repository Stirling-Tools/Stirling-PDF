import { Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { SelectionSelectionMenuProps } from "@embedpdf/plugin-selection/react";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { PdfHighlightAnnoObject } from "@embedpdf/models";
import { generateId } from "@app/utils/generateId";

// Common highlighter-pen colors, offered directly on the text selection
// so highlighting a passage doesn't require arming the Highlight tool from
// the Annotate sidebar first.
const HIGHLIGHT_COLORS = [
  "#ffd54f", // yellow (matches Annotate's own highlight default)
  "#a5d6a7", // green
  "#90caf9", // blue
  "#f48fb1", // pink
  "#ffab91", // orange
];
const HIGHLIGHT_OPACITY = 0.6;

export function TextSelectionMenu({
  selected,
  menuWrapperProps,
  placement,
  context,
}: SelectionSelectionMenuProps) {
  const { t } = useTranslation();
  const { provides: selection } = useSelectionCapability();
  const { provides: annotation } = useAnnotationCapability();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      menuWrapperProps?.ref?.(node);
    },
    [menuWrapperProps],
  );

  const showAbove = placement?.suggestTop ?? true;

  useEffect(() => {
    if (!selected || !wrapperRef.current) {
      setPosition(null);
      return;
    }
    const update = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const r = wrapper.getBoundingClientRect();
      setPosition({
        top: showAbove ? r.top - 8 : r.bottom + 8,
        left: r.left + r.width / 2,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [selected, showAbove]);

  const handleCopy = useCallback(() => {
    selection?.copyToClipboard();
  }, [selection]);

  const handleHighlight = useCallback(
    (color: string) => {
      if (!selection || !annotation) return;
      const pageIndex = context.pageIndex;
      const formatted = selection.getFormattedSelectionForPage(pageIndex);
      if (!formatted || formatted.segmentRects.length === 0) return;

      const highlightAnnotation: PdfHighlightAnnoObject = {
        type: PdfAnnotationSubtype.HIGHLIGHT,
        id: generateId(),
        pageIndex,
        rect: formatted.rect,
        segmentRects: formatted.segmentRects,
        strokeColor: color,
        opacity: HIGHLIGHT_OPACITY,
      };
      annotation.createAnnotation(pageIndex, highlightAnnotation);
      selection.clear();
    },
    [selection, annotation, context.pageIndex],
  );

  const portalContent =
    position &&
    createPortal(
      <div
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          transform: `translate(-50%, ${showAbove ? "-100%" : "0"})`,
          zIndex: 10000,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 6px",
          borderRadius: "var(--radius-md, 8px)",
          background: "var(--c-surface-raised, #fff)",
          border: "1px solid var(--c-border-subtle, #e5e7eb)",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {HIGHLIGHT_COLORS.map((color) => (
          <Tooltip
            key={color}
            label={t("viewer.highlightSelection", "Highlight")}
            withArrow
          >
            <button
              type="button"
              onClick={() => handleHighlight(color)}
              aria-label={t("viewer.highlightSelection", "Highlight")}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: color,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                padding: 0,
              }}
            />
          </Tooltip>
        ))}
        <Tooltip label={t("viewer.copyText", "Copy")} withArrow>
          <ActionIcon
            variant="secondary"
            accent="neutral"
            size="md"
            onClick={handleCopy}
            aria-label={t("viewer.copyText", "Copy")}
          >
            <ContentCopyIcon style={{ fontSize: 18 }} />
          </ActionIcon>
        </Tooltip>
      </div>,
      document.body,
    );

  return (
    <>
      <div ref={setRef} style={menuWrapperProps?.style} />
      {portalContent}
    </>
  );
}
