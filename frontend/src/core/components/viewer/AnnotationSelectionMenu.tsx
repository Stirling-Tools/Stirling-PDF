import { Group } from "@mantine/core";
import { createPortal } from "react-dom";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useAnnotation } from "@embedpdf/plugin-annotation/react";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import {
  PdfAnnotationSubtype,
  type PdfAnnotationObject,
} from "@embedpdf/models";
import type { AnnotationObject } from "@app/components/viewer/viewerTypes";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import { useViewer } from "@app/contexts/ViewerContext";
import { useAnnotationMenuHandlers } from "@app/components/viewer/useAnnotationMenuHandlers";
import { AnnotationTypeButtons } from "@app/components/viewer/AnnotationTypeButtons";

/**
 * Props interface matching EmbedPDF's annotation selection menu pattern
 * This matches the type from @embedpdf/plugin-annotation
 */
export interface AnnotationSelectionMenuProps {
  documentId?: string;
  context?: {
    type: "annotation";
    annotation: TrackedAnnotation<PdfAnnotationObject>;
    pageIndex: number;
  };
  selected: boolean;
  menuWrapperProps?: {
    ref?: (node: HTMLDivElement | null) => void;
    style?: React.CSSProperties;
  };
}

export function AnnotationSelectionMenu(props: AnnotationSelectionMenuProps) {
  const activeDocumentId = useActiveDocumentId();
  if (!activeDocumentId) return null;
  return (
    <AnnotationSelectionMenuInner documentId={activeDocumentId} {...props} />
  );
}

function AnnotationSelectionMenuInner({
  documentId,
  context,
  selected,
  menuWrapperProps,
}: AnnotationSelectionMenuProps & { documentId: string }) {
  const annotation = context?.annotation;
  const pageIndex = context?.pageIndex;
  const { state, provides } = useAnnotation(documentId);
  const { scrollActions, requestCommentFocus } = useViewer();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const handlers = useAnnotationMenuHandlers({
    annotation,
    pageIndex,
    documentId,
    provides,
    scrollActions,
    requestCommentFocus,
    wrapperRef,
  });

  // Read isInSidebar from live EmbedPDF state rather than annotation.object, which can be
  // stale after updateAnnotation() is called while the annotation is selected.
  // Also checks non-empty contents: customData.isComment is not persisted to PDF, but
  // contents is a standard PDF field and survives save/reload.
  const freshIsInSidebar = useMemo(() => {
    const annId = (annotation?.object as AnnotationObject | undefined)?.id;
    if (!annId) return false;
    for (const tracked of Object.values(state.byUid)) {
      const obj = tracked.object;
      if (obj.id !== annId) continue;
      const { type } = obj;
      // TEXT and CARET are standalone comment annotations — they use CommentButton,
      // not AttachCommentButton, so isInSidebar is irrelevant for them.
      if (type === PdfAnnotationSubtype.TEXT || type === PdfAnnotationSubtype.CARET)
        return false;
      // customData is a runtime field EmbedPDF adds but doesn't declare in its TS types
      const customData = (obj as unknown as { customData?: Record<string, unknown> })
        .customData;
      const isExplicit = customData?.isComment === true;
      // customData (incl. toolId/isComment) is not persisted to PDF; contents is.
      // Any non-TEXT/FreeText/CARET annotation with non-empty contents has a comment.
      const hasContents =
        type !== PdfAnnotationSubtype.FREETEXT &&
        !obj.inReplyToId &&
        (obj.contents ?? "").trim().length > 0;
      return isExplicit || hasContents;
    }
    return false;
  }, [state, annotation?.object]);

  // Auto-open the comments sidebar when a comment annotation is selected
  useEffect(() => {
    const annObj = annotation?.object as AnnotationObject | undefined;
    const annId = annObj?.id;
    if (!selected || !annId || pageIndex === undefined) return;
    const annType = annObj?.type;
    // TEXT (type 1) = textComment; CARET (type 14) = insertText/replaceText.
    // These are always comment annotations regardless of toolId (lost after reload).
    const isComment =
      annType === PdfAnnotationSubtype.TEXT ||
      annType === PdfAnnotationSubtype.CARET ||
      freshIsInSidebar;
    if (!isComment) return;
    requestCommentFocus(
      documentId,
      pageIndex,
      annId,
      (annObj?.contents ?? "").trim().length > 0,
    );
  }, [selected, annotation?.object, freshIsInSidebar]);

  // Click outside to deselect
  useEffect(() => {
    if (!selected) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-annotation-selection-menu]")) return;
      if (target.closest("[data-no-interaction]")) return;
      if (target.closest(".mantine-Popover-dropdown")) return;
      provides?.deselectAnnotation?.();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [selected, provides]);

  // Merge refs — menuWrapperProps.ref is a callback ref from EmbedPDF
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      menuWrapperProps?.ref?.(node);
    },
    [menuWrapperProps],
  );

  // Track menu position via MutationObserver (handles drag repositioning)
  useEffect(() => {
    if (!selected || !annotation || !wrapperRef.current) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        setMenuPosition(null);
        return;
      }
      const rect = wrapper.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    };

    updatePosition();

    const observer = new MutationObserver(updatePosition);
    observer.observe(wrapperRef.current, {
      attributes: true,
      attributeFilter: ["style"],
    });
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [selected]);

  if (!selected || !annotation) return null;

  const menuContent = menuPosition ? (
    <div
      data-annotation-selection-menu
      style={{
        position: "fixed",
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        transform: "translateX(-50%)",
        pointerEvents: "auto",
        zIndex: 10000,
        backgroundColor: "var(--mantine-color-body)",
        borderRadius: 8,
        padding: "8px 12px",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
        border: "1px solid var(--mantine-color-default-border)",
        fontSize: "14px",
        minWidth: `${handlers.menuWidth}px`,
        transition: "min-width 0.2s ease",
      }}
    >
      <Group gap="sm" wrap="nowrap" justify="center">
        <AnnotationTypeButtons
          {...handlers}
          isInSidebar={freshIsInSidebar}
          annotation={annotation}
          documentId={documentId}
          pageIndex={pageIndex}
          annotationId={handlers.annotationId}
        />
      </Group>
    </div>
  ) : null;

  return (
    <>
      {/* Invisible wrapper for EmbedPDF positioning — pointer-events:none so drag still works */}
      <div
        ref={setRef}
        style={{
          ...menuWrapperProps?.style,
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
