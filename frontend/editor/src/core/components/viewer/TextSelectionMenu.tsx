import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Tooltip, Popover, TextInput, Stack } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
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
import { MARKUP_ANNOTATION_COLORS } from "@app/components/viewer/annotationDefaults";
import { alert } from "@app/components/toast";
import { getExternalHref } from "@app/utils/externalUrl";
import "@app/components/viewer/TextSelectionMenu.css";

export type TextSelectionMenuProps = SelectionSelectionMenuProps & {
  documentId?: string;
};

export function TextSelectionMenu(props: TextSelectionMenuProps) {
  const contextDocId = useActiveDocumentId();
  const documentId = props.documentId ?? contextDocId;

  if (!documentId) {
    return null;
  }

  return <TextSelectionMenuInner {...props} documentId={documentId} />;
}

function TextSelectionMenuInner({
  selected,
  menuWrapperProps,
  placement,
  documentId,
}: TextSelectionMenuProps & { documentId: string }) {
  const { t } = useTranslation();
  const { provides: selection } = useSelectionCapability();
  const { provides: annotationProvides } = useAnnotation(documentId ?? "");

  const { handleToolSelectForced, setLeftPanelView } = useToolWorkflow();
  const {
    setRedactionMode,
    activateRedact,
    setRedactionConfig,
    redactionApiRef,
    isBridgeReady,
    manualRedactColor,
  } = useRedaction();
  const { actions: navActions } = useNavigationActions();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [pendingRedactActivation, setPendingRedactActivation] = useState(false);

  // The redact tool bridge mounts after its panel opens, so activation waits
  // for bridge readiness instead of guessing a timeout.
  useEffect(() => {
    if (!pendingRedactActivation || !isBridgeReady) return;
    setPendingRedactActivation(false);
    const currentType = redactionApiRef?.current?.getActiveType?.();
    if (currentType !== RedactionMode.Redact) {
      activateRedact?.();
    }
  }, [pendingRedactActivation, isBridgeReady, redactionApiRef, activateRedact]);

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
    setLeftPanelView?.("toolContent");
  }, [handleToolSelectForced, setLeftPanelView]);

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
      MARKUP_ANNOTATION_COLORS.highlight,
      PdfBlendMode.Multiply,
    );
  }, [createMarkupAnnotation]);

  const handleStrikeout = useCallback(() => {
    createMarkupAnnotation(
      PdfAnnotationSubtype.STRIKEOUT,
      MARKUP_ANNOTATION_COLORS.strikeout,
    );
  }, [createMarkupAnnotation]);

  const handleUnderline = useCallback(() => {
    createMarkupAnnotation(
      PdfAnnotationSubtype.UNDERLINE,
      MARKUP_ANNOTATION_COLORS.underline,
    );
  }, [createMarkupAnnotation]);

  const handleSquiggly = useCallback(() => {
    createMarkupAnnotation(
      PdfAnnotationSubtype.SQUIGGLY,
      MARKUP_ANNOTATION_COLORS.squiggly,
    );
  }, [createMarkupAnnotation]);

  const handleAddLink = useCallback(
    (url: string) => {
      const uri = url.trim();
      if (!documentId || !uri) return;
      // User input is untrusted: refuse URI schemes the viewer itself would
      // not open, so javascript: and friends cannot ride out in the PDF. The
      // original string is persisted verbatim once it passes the allowlist.
      if (!getExternalHref(uri)) return;
      const selections = selection?.getFormattedSelection(documentId) ?? [];
      if (!selections.length) return;

      for (const sel of selections) {
        annotationProvides?.createAnnotation(sel.pageIndex, {
          type: PdfAnnotationSubtype.LINK,
          id: uuidV4(),
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
        strokeColor: manualRedactColor,
        color: manualRedactColor,
        overlayColor: manualRedactColor,
        fillColor: manualRedactColor,
        interiorColor: manualRedactColor,
        backgroundColor: manualRedactColor,
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
    setLeftPanelView?.("toolContent");
    setPendingRedactActivation(true);
  }, [
    documentId,
    selection,
    annotationProvides,
    manualRedactColor,
    setRedactionConfig,
    setRedactionMode,
    navActions,
    setLeftPanelView,
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
          <Tooltip label={t("viewer.copyText", "Copy")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleCopy}
              aria-label={t("viewer.copyText", "Copy")}
            >
              <Icon name="copy" size={20} />
            </button>
          </Tooltip>

          <Tooltip label={t("annotation.highlight", "Highlight")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleHighlight}
              aria-label={t("annotation.highlight", "Highlight")}
            >
              <Icon name="highlighter" size={20} />
            </button>
          </Tooltip>

          <Tooltip label={t("annotation.strikeout", "Strikeout")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleStrikeout}
              aria-label={t("annotation.strikeout", "Strikeout")}
            >
              <Icon name="strikethrough" size={20} />
            </button>
          </Tooltip>

          <Tooltip label={t("annotation.underline", "Underline")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleUnderline}
              aria-label={t("annotation.underline", "Underline")}
            >
              <Icon name="underline" size={20} />
            </button>
          </Tooltip>

          <Tooltip label={t("annotation.squiggly", "Squiggly")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleSquiggly}
              aria-label={t("annotation.squiggly", "Squiggly")}
            >
              <Icon name="line-squiggle" size={20} />
            </button>
          </Tooltip>

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
                    <Icon name="link" size={20} />
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

          <Tooltip label={t("workbenchBar.redact", "Redact")} withArrow>
            <button
              type="button"
              className="embedpdf-text-selection-btn"
              onClick={handleRedact}
              aria-label={t("workbenchBar.redact", "Redact")}
            >
              <Icon name="file-x" size={20} />
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
