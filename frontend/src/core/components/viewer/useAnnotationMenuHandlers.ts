import { useCallback, useMemo, type RefObject } from "react";
import {
  PdfActionType,
  PdfAnnotationSubtype,
  PdfAnnotationReplyType,
  type PdfAnnotationObject,
} from "@embedpdf/models";
import type {
  TrackedAnnotation,
  AnnotationScope,
} from "@embedpdf/plugin-annotation";
import type {
  AnnotationObject,
  AnnotationPatch,
} from "@app/components/viewer/viewerTypes";
import type { ScrollActions } from "@app/contexts/viewer/viewerActions";

export type AnnotationType =
  | "textMarkup"
  | "ink"
  | "inkHighlighter"
  | "text"
  | "note"
  | "comment"
  | "shape"
  | "line"
  | "stamp"
  | "unknown";

export type FirstLinkTarget =
  | { type: "uri"; uri: string }
  | { type: "goto"; pageIndex: number };

interface UseAnnotationMenuHandlersParams {
  annotation: TrackedAnnotation<PdfAnnotationObject> | undefined;
  pageIndex: number | undefined;
  documentId: string;
  provides: AnnotationScope | null;
  scrollActions: ScrollActions;
  requestCommentFocus: (
    documentId: string,
    pageIndex: number,
    annotationId: string,
    hasContent: boolean,
  ) => void;
  wrapperRef: RefObject<HTMLDivElement | null>;
}

export interface AnnotationMenuState {
  annotationType: AnnotationType;
  menuWidth: number;
  obj: AnnotationObject | undefined;
  annotationId: string | undefined;
  firstLinkTarget: FirstLinkTarget | null;
  hasCommentContent: boolean;
  isInSidebar: boolean;
  currentColor: string;
  strokeColor: string;
  fillColor: string;
  backgroundColor: string;
  textColor: string;
  currentOpacity: number;
  currentWidth: number;
}

export interface AnnotationMenuHandlers {
  onDelete: () => void;
  onEdit: () => void;
  onColorChange: (
    color: string,
    target: "main" | "stroke" | "fill" | "text" | "background",
  ) => void;
  onOpacityChange: (opacity: number) => void;
  onWidthChange: (width: number) => void;
  onPropertiesUpdate: (patch: AnnotationPatch) => void;
  onGoToLink: () => void;
  onAddLink: (url: string) => void;
  onAddToSidebar: () => void;
  onViewComment: () => void;
  onCommentColorChange: (color: string) => void;
}

export function useAnnotationMenuHandlers({
  annotation,
  pageIndex,
  documentId,
  provides,
  scrollActions,
  requestCommentFocus,
  wrapperRef,
}: UseAnnotationMenuHandlersParams): AnnotationMenuState &
  AnnotationMenuHandlers {
  const obj = annotation?.object as AnnotationObject | undefined;
  const annotationId = obj?.id;

  const attachedLinks = useMemo(() => {
    if (!annotationId || !provides?.getAttachedLinks) return [];
    try {
      return provides.getAttachedLinks(annotationId) ?? [];
    } catch {
      return [];
    }
  }, [annotationId, provides]);

  const firstLinkTarget = useMemo<FirstLinkTarget | null>(() => {
    const linkObj = attachedLinks[0]?.object as
      | {
          target?: {
            type: string;
            action?: {
              type: number;
              uri?: string;
              destination?: { pageIndex: number };
            };
          };
        }
      | undefined;
    if (!linkObj?.target || linkObj.target.type !== "action") return null;
    const act = linkObj.target.action;
    if (act && act.type === PdfActionType.URI && act.uri)
      return { type: "uri", uri: act.uri };
    if (
      act &&
      (act.type === PdfActionType.Goto ||
        act.type === PdfActionType.RemoteGoto) &&
      act.destination
    )
      return { type: "goto", pageIndex: act.destination.pageIndex };
    return null;
  }, [attachedLinks]);

  const annotationType = useMemo((): AnnotationType => {
    const type = annotation?.object?.type;
    const toolId = (annotation?.object as AnnotationObject | undefined)
      ?.customData?.toolId;

    if (type !== undefined && [9, 10, 11, 12].includes(type))
      return "textMarkup";
    if (type === 15)
      return toolId === "inkHighlighter" ? "inkHighlighter" : "ink";
    if (type === 1 && toolId === "textComment") return "comment";
    if (type === 14 && (toolId === "insertText" || toolId === "replaceText"))
      return "comment";
    if (type === 3) return "note";
    if (type !== undefined && [5, 6, 7].includes(type)) return "shape";
    if (type !== undefined && [4, 8].includes(type)) return "line";
    if (type === 13) return "stamp";
    return "unknown";
  }, [annotation]);

  const menuWidth = useMemo((): number => {
    switch (annotationType) {
      case "stamp":
        return 80;
      case "inkHighlighter":
      case "comment":
      case "textMarkup":
      case "text":
      case "note":
        return 280;
      case "shape":
        return 200;
      default:
        return 260;
    }
  }, [annotationType]);

  const hasCommentContent = (obj?.contents ?? "").trim().length > 0;
  const isInSidebar =
    (obj?.customData as Record<string, unknown> | undefined)?.isComment ===
    true;

  // Derived style values
  const currentColor = (() => {
    if (!obj) return "#000000";
    const type = obj.type;
    if (type === 3) return obj.textColor || obj.color || "#000000";
    if (type !== undefined && [4, 5, 6, 7, 8].includes(type))
      return obj.strokeColor || obj.color || "#000000";
    return obj.color || obj.strokeColor || "#000000";
  })();
  const strokeColor = obj?.strokeColor || obj?.color || "#000000";
  const fillColor = obj?.color || obj?.fillColor || "#0000ff";
  const backgroundColor =
    obj?.backgroundColor || obj?.fillColor || obj?.color || "#ffffff";
  const textColor = obj?.textColor || obj?.color || "#000000";
  const currentOpacity = Math.round((obj?.opacity ?? 1) * 100);
  const currentWidth =
    obj?.strokeWidth ??
    obj?.borderWidth ??
    obj?.lineWidth ??
    obj?.thickness ??
    2;

  // Handlers
  const onDelete = useCallback(() => {
    if (provides?.deleteAnnotation && annotationId && pageIndex !== undefined) {
      provides.deleteAnnotation(pageIndex, annotationId);
    }
  }, [provides, annotationId, pageIndex]);

  const onEdit = useCallback(() => {
    const root = wrapperRef.current?.closest("[data-no-interaction]");
    const main = root?.firstElementChild;
    const hitArea = main?.lastElementChild ?? main?.firstElementChild;
    if (!hitArea) return;
    hitArea.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  }, [wrapperRef]);

  const onColorChange = useCallback(
    (
      color: string,
      target: "main" | "stroke" | "fill" | "text" | "background",
    ) => {
      if (
        !provides?.updateAnnotation ||
        !annotationId ||
        pageIndex === undefined
      )
        return;
      const type = obj?.type;
      const patch: AnnotationPatch = {};

      if (target === "stroke") {
        patch.strokeColor = color;
        patch.color = obj?.color || "#0000ff";
        patch.strokeWidth = currentWidth;
      } else if (target === "fill") {
        patch.color = color;
        patch.strokeColor = obj?.strokeColor || "#000000";
        patch.strokeWidth = currentWidth;
      } else if (target === "background") {
        patch.backgroundColor = color;
        patch.fillColor = color;
        patch.color = color;
      } else if (target === "text") {
        patch.textColor = color;
        patch.fontColor = color;
        patch.fontSize = obj?.fontSize ?? 14;
        patch.fontFamily = obj?.fontFamily ?? "Helvetica";
        patch.contents = obj?.contents ?? "";
      } else {
        patch.color = color;
        if (type !== undefined && [9, 10, 11, 12].includes(type)) {
          patch.strokeColor = color;
          patch.fillColor = color;
          patch.opacity = obj?.opacity ?? 1;
        }
        if (type !== undefined && [4, 8].includes(type)) {
          patch.strokeColor = color;
          patch.strokeWidth = obj?.strokeWidth ?? obj?.lineWidth ?? 2;
          patch.lineWidth = obj?.lineWidth ?? obj?.strokeWidth ?? 2;
        }
        if (type === 15) {
          patch.strokeColor = color;
          patch.strokeWidth = obj?.strokeWidth ?? obj?.thickness ?? 2;
          patch.opacity = obj?.opacity ?? 1;
        }
      }

      provides.updateAnnotation(pageIndex, annotationId, patch);
    },
    [provides, annotationId, pageIndex, obj, currentWidth],
  );

  const onOpacityChange = useCallback(
    (opacity: number) => {
      if (
        !provides?.updateAnnotation ||
        !annotationId ||
        pageIndex === undefined
      )
        return;
      provides.updateAnnotation(pageIndex, annotationId, {
        opacity: opacity / 100,
      });
    },
    [provides, annotationId, pageIndex],
  );

  const onWidthChange = useCallback(
    (width: number) => {
      if (
        !provides?.updateAnnotation ||
        !annotationId ||
        pageIndex === undefined
      )
        return;
      provides.updateAnnotation(pageIndex, annotationId, {
        strokeWidth: width,
      });
    },
    [provides, annotationId, pageIndex],
  );

  const onPropertiesUpdate = useCallback(
    (patch: Record<string, unknown>) => {
      if (
        !provides?.updateAnnotation ||
        !annotationId ||
        pageIndex === undefined
      )
        return;
      provides.updateAnnotation(pageIndex, annotationId, patch);
    },
    [provides, annotationId, pageIndex],
  );

  const onGoToLink = useCallback(() => {
    if (!firstLinkTarget) return;
    if (firstLinkTarget.type === "uri") {
      window.open(firstLinkTarget.uri, "_blank", "noopener,noreferrer");
    } else {
      scrollActions.scrollToPage(firstLinkTarget.pageIndex + 1);
    }
  }, [firstLinkTarget, scrollActions]);

  const onAddLink = useCallback(
    (url: string) => {
      const uri = url.trim();
      if (
        !uri ||
        !provides?.createAnnotation ||
        pageIndex === undefined ||
        !annotationId ||
        !obj?.rect
      )
        return;
      provides.createAnnotation(pageIndex, {
        type: PdfAnnotationSubtype.LINK,
        id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        pageIndex,
        rect: obj.rect,
        target: { type: "action", action: { type: PdfActionType.URI, uri } },
        inReplyToId: annotationId,
        replyType: PdfAnnotationReplyType.Group,
      });
    },
    [provides, pageIndex, annotationId, obj?.rect],
  );

  const onAddToSidebar = useCallback(() => {
    if (!provides?.updateAnnotation || !annotationId || pageIndex === undefined)
      return;
    const existingCustomData = (obj?.customData ?? {}) as Record<
      string,
      unknown
    >;
    provides.updateAnnotation(pageIndex, annotationId, {
      customData: { ...existingCustomData, isComment: true },
    } as AnnotationPatch);
    requestCommentFocus(documentId, pageIndex, annotationId, false);
  }, [provides, annotationId, pageIndex, obj, documentId, requestCommentFocus]);

  const onViewComment = useCallback(() => {
    requestCommentFocus(
      documentId,
      pageIndex ?? 0,
      annotationId ?? "",
      hasCommentContent,
    );
  }, [
    requestCommentFocus,
    documentId,
    pageIndex,
    annotationId,
    hasCommentContent,
  ]);

  const onCommentColorChange = useCallback(
    (color: string) => {
      if (
        !provides?.updateAnnotation ||
        !annotationId ||
        pageIndex === undefined
      )
        return;
      provides.updateAnnotation(pageIndex, annotationId, {
        strokeColor: color,
        color,
      });
    },
    [provides, annotationId, pageIndex],
  );

  return {
    annotationType,
    menuWidth,
    obj,
    annotationId,
    firstLinkTarget,
    hasCommentContent,
    isInSidebar,
    currentColor,
    strokeColor,
    fillColor,
    backgroundColor,
    textColor,
    currentOpacity,
    currentWidth,
    onDelete,
    onEdit,
    onColorChange,
    onOpacityChange,
    onWidthChange,
    onPropertiesUpdate,
    onGoToLink,
    onAddLink,
    onAddToSidebar,
    onViewComment,
    onCommentColorChange,
  };
}
