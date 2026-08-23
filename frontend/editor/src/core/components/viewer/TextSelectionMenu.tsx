import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Tooltip, Popover, TextInput, Stack } from "@mantine/core";
import { Button } from "@app/ui/Button";
import type { SelectionSelectionMenuProps } from "@embedpdf/plugin-selection/react";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { useAnnotation } from "@embedpdf/plugin-annotation/react";
import { RedactionMode } from "@embedpdf/plugin-redaction";
import {
  PdfAnnotationSubtype,
  PdfActionType,
  PdfBlendMode,
  uuidV4,
} from "@embedpdf/models";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useRedaction } from "@app/contexts/RedactionContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import {
  defaultParameters,
  RedactParameters,
} from "@app/hooks/tools/redact/useRedactParameters";
import { alert } from "@app/components/toast";
import "@app/components/viewer/TextSelectionMenu.css";

// ---------------------------------------------------------------------------
// Inline SVG Icons matching EmbedPDF selection toolbar design
// ---------------------------------------------------------------------------

function CopyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M5 15.5H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function HighlightIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block" }}
    >
      <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#FACC15" />
      <path
        d="M12 5.8L7.6 17.5H9.6L10.6 14.7H13.4L14.4 17.5H16.4L12 5.8ZM11.3 12.8L12 10.4L12.7 12.8H11.3Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function StrikeoutIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block" }}
    >
      <path
        d="M12 4.5L7.2 18H9.4L10.4 15.2H13.6L14.6 18H16.8L12 4.5ZM11.2 13L12 10.4L12.8 13H11.2Z"
        fill="currentColor"
      />
      <line
        x1="3"
        y1="13.2"
        x2="21"
        y2="13.2"
        stroke="#EF4444"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UnderlineIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block" }}
    >
      <path
        d="M12 3.8L7.2 17.2H9.4L10.4 14.4H13.6L14.6 17.2H16.8L12 3.8ZM11.2 12.2L12 9.6L12.8 12.2H11.2Z"
        fill="currentColor"
      />
      <line
        x1="3.5"
        y1="20"
        x2="20.5"
        y2="20"
        stroke="#EF4444"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SquigglyIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block" }}
    >
      <path
        d="M12 3.8L7.2 17.2H9.4L10.4 14.4H13.6L14.6 17.2H16.8L12 3.8ZM11.2 12.2L12 9.6L12.8 12.2H11.2Z"
        fill="currentColor"
      />
      <path
        d="M3.5 20c1.2-1.2 2.3-1.2 3.5 0s2.3 1.2 3.5 0 2.3-1.2 3.5 0 2.3 1.2 3.5 0 2.3-1.2 3 0"
        stroke="#EF4444"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function RedactIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block" }}
    >
      <defs>
        <pattern
          id="text-sel-redact-stripes"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="4"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      <path
        d="M7 3.5h10M12 3.5v4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="2.5"
        y="9"
        width="19"
        height="12"
        rx="3"
        fill="url(#text-sel-redact-stripes)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type TextSelectionMenuProps = SelectionSelectionMenuProps & {
  documentId?: string;
};

export function TextSelectionMenu({
  selected,
  menuWrapperProps,
  placement,
  documentId: propsDocumentId,
}: TextSelectionMenuProps) {
  const { t } = useTranslation();
  const contextDocId = useActiveDocumentId();
  const documentId = propsDocumentId ?? contextDocId;

  const { provides: selection } = useSelectionCapability();
  const { provides: annotationProvides } = useAnnotation(documentId ?? "");

  const { handleToolSelectForced, setSidebarsVisible, setLeftPanelView } =
    useToolWorkflow();
  const {
    setRedactionMode,
    activateRedact,
    setRedactionConfig,
    redactionApiRef,
  } = useRedaction();
  const { actions: navActions } = useNavigationActions();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

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
    if (documentId) {
      selection?.copyToClipboard(documentId);
      selection?.clear(documentId);
      alert({
        alertType: "neutral",
        title: t("common.copied", "Copied to clipboard"),
        durationMs: 2000,
      });
    }
  }, [selection, documentId, t]);

  const openAnnotateUi = useCallback(() => {
    handleToolSelectForced?.("annotate");
    setSidebarsVisible?.(true);
    setLeftPanelView?.("toolContent");
  }, [handleToolSelectForced, setSidebarsVisible, setLeftPanelView]);

  const createMarkupAnnotation = useCallback(
    (
      subtype:
        | PdfAnnotationSubtype.HIGHLIGHT
        | PdfAnnotationSubtype.STRIKEOUT
        | PdfAnnotationSubtype.UNDERLINE
        | PdfAnnotationSubtype.SQUIGGLY,
      color: string,
      blendMode?: PdfBlendMode,
    ) => {
      if (!documentId) return;
      const selections = selection?.getFormattedSelection(documentId) ?? [];
      if (!selections.length) return;

      const apply = (text?: string) => {
        for (const sel of selections) {
          annotationProvides?.createAnnotation(sel.pageIndex, {
            type: subtype,
            strokeColor: color,
            color,
            opacity: 1,
            ...(blendMode !== undefined ? { blendMode } : {}),
            rect: sel.rect,
            segmentRects: sel.segmentRects,
            pageIndex: sel.pageIndex,
            created: new Date(),
            id: uuidV4(),
            ...(text ? { custom: { text } } : {}),
          });
        }
        selection?.clear(documentId);
        navActions?.setHasUnsavedChanges(true);
        openAnnotateUi();
      };

      const selTask = selection?.getSelectedText(documentId);
      if (selTask) {
        selTask.wait(
          (texts) => apply(texts.join("\n")),
          () => apply(),
        );
      } else {
        apply();
      }
    },
    [documentId, selection, annotationProvides, navActions, openAnnotateUi],
  );

  const handleHighlight = useCallback(() => {
    createMarkupAnnotation(
      PdfAnnotationSubtype.HIGHLIGHT,
      "#FFCD45",
      PdfBlendMode.Multiply,
    );
  }, [createMarkupAnnotation]);

  const handleStrikeout = useCallback(() => {
    createMarkupAnnotation(PdfAnnotationSubtype.STRIKEOUT, "#E44234");
  }, [createMarkupAnnotation]);

  const handleUnderline = useCallback(() => {
    createMarkupAnnotation(PdfAnnotationSubtype.UNDERLINE, "#E44234");
  }, [createMarkupAnnotation]);

  const handleSquiggly = useCallback(() => {
    createMarkupAnnotation(PdfAnnotationSubtype.SQUIGGLY, "#E44234");
  }, [createMarkupAnnotation]);

  const handleAddLink = useCallback(
    (url: string) => {
      const uri = url.trim();
      if (!documentId || !uri) return;
      const selections = selection?.getFormattedSelection(documentId) ?? [];
      if (!selections.length) return;

      for (const sel of selections) {
        annotationProvides?.createAnnotation(sel.pageIndex, {
          type: PdfAnnotationSubtype.LINK,
          id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          pageIndex: sel.pageIndex,
          rect: sel.rect,
          target: { type: "action", action: { type: PdfActionType.URI, uri } },
          created: new Date(),
        });
      }
      selection?.clear(documentId);
      setLinkPopoverOpen(false);
      setLinkUrl("");
      navActions?.setHasUnsavedChanges(true);
      openAnnotateUi();
    },
    [documentId, selection, annotationProvides, navActions, openAnnotateUi],
  );

  const handleRedact = useCallback(() => {
    if (!documentId) return;
    const selections = selection?.getFormattedSelection(documentId) ?? [];
    for (const sel of selections) {
      annotationProvides?.createAnnotation(sel.pageIndex, {
        type: PdfAnnotationSubtype.REDACT,
        strokeColor: "#E44234",
        color: "#000000",
        overlayColor: "#000000",
        fillColor: "#000000",
        interiorColor: "#000000",
        backgroundColor: "#000000",
        opacity: 1,
        rect: sel.rect,
        segmentRects: sel.segmentRects,
        pageIndex: sel.pageIndex,
        created: new Date(),
        id: uuidV4(),
      });
    }
    selection?.clear(documentId);

    // Bring the full Redact tool UI
    const manualConfig: RedactParameters = {
      ...defaultParameters,
      mode: "manual",
    };
    setRedactionConfig?.(manualConfig);
    setRedactionMode?.(true);
    navActions?.setHasUnsavedChanges(true);
    navActions?.setToolAndWorkbench("redact", "viewer");
    setSidebarsVisible?.(true);
    setLeftPanelView?.("toolContent");
    setTimeout(() => {
      const currentType = redactionApiRef?.current?.getActiveType?.();
      if (currentType !== RedactionMode.Redact) {
        activateRedact?.();
      }
    }, 200);
  }, [
    documentId,
    selection,
    annotationProvides,
    setRedactionConfig,
    setRedactionMode,
    navActions,
    setSidebarsVisible,
    setLeftPanelView,
    redactionApiRef,
    activateRedact,
  ]);

  const portalContent =
    position &&
    createPortal(
      <div
        data-text-selection-menu
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          transform: `translate(-50%, ${showAbove ? "-100%" : "0"})`,
          zIndex: 10000,
          pointerEvents: "auto",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="embedpdf-text-selection-menu">
          {/* 1. Copy */}
          <Tooltip label={t("viewer.copyText", "Copy")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleCopy}
              aria-label={t("viewer.copyText", "Copy")}
            >
              <CopyIcon />
            </button>
          </Tooltip>

          {/* 2. Highlight */}
          <Tooltip label={t("annotation.highlight", "Highlight")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleHighlight}
              aria-label={t("annotation.highlight", "Highlight")}
            >
              <HighlightIcon />
            </button>
          </Tooltip>

          {/* 3. Strikethrough */}
          <Tooltip label={t("annotation.strikeout", "Strikeout")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleStrikeout}
              aria-label={t("annotation.strikeout", "Strikeout")}
            >
              <StrikeoutIcon />
            </button>
          </Tooltip>

          {/* 4. Underline */}
          <Tooltip label={t("annotation.underline", "Underline")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleUnderline}
              aria-label={t("annotation.underline", "Underline")}
            >
              <UnderlineIcon />
            </button>
          </Tooltip>

          {/* 5. Squiggly */}
          <Tooltip label={t("annotation.squiggly", "Squiggly")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleSquiggly}
              aria-label={t("annotation.squiggly", "Squiggly")}
            >
              <SquigglyIcon />
            </button>
          </Tooltip>

          {/* 6. Link */}
          <Popover
            opened={linkPopoverOpen}
            onChange={setLinkPopoverOpen}
            position={showAbove ? "top" : "bottom"}
            withArrow
            shadow="md"
            transitionProps={{ duration: 0 }}
          >
            <Popover.Target>
              <button
                type="button"
                className="embedpdf-text-selection-btn"
                onClick={() => setLinkPopoverOpen((o) => !o)}
                aria-label={t("viewer.comments.addLink", "Add link")}
              >
                <Tooltip
                  label={t("viewer.comments.addLink", "Add link")}
                  withArrow
                  disabled={linkPopoverOpen}
                >
                  <span style={{ display: "inline-flex" }}>
                    <LinkIcon />
                  </span>
                </Tooltip>
              </button>
            </Popover.Target>
            <Popover.Dropdown
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "var(--mantine-color-body)",
                borderColor: "var(--mantine-color-default-border)",
              }}
            >
              <Stack gap="xs" style={{ minWidth: 220 }}>
                <TextInput
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && linkUrl.trim()) {
                      handleAddLink(linkUrl);
                    }
                  }}
                  size="xs"
                  autoFocus
                />
                <Button
                  size="sm"
                  disabled={!linkUrl.trim()}
                  onClick={() => handleAddLink(linkUrl)}
                >
                  {t("viewer.comments.addLink", "Add link")}
                </Button>
              </Stack>
            </Popover.Dropdown>
          </Popover>

          {/* 7. Redact */}
          <Tooltip label={t("workbenchBar.redact", "Redact")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleRedact}
              aria-label={t("workbenchBar.redact", "Redact")}
            >
              <RedactIcon />
            </button>
          </Tooltip>
        </div>
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
