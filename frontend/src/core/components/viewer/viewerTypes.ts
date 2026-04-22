export interface AnnotationRect {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

export interface SignatureAPI {
  addImageSignature: (
    signatureData: string,
    x: number,
    y: number,
    width: number,
    height: number,
    pageIndex: number,
  ) => void;
  activateDrawMode: () => void;
  activateSignaturePlacementMode: () => void;
  activateDeleteMode: () => void;
  deleteAnnotation: (annotationId: string, pageIndex: number) => void;
  updateDrawSettings: (color: string, size: number) => void;
  deactivateTools: () => void;
  getPageAnnotations: (pageIndex: number) => Promise<any[]>;
  moveAnnotation?: (
    pageIndex: number,
    annotationId: string,
    newRect: AnnotationRect,
  ) => void;
}

export interface AnnotationAPI {
  activateAnnotationTool: (
    toolId: AnnotationToolId,
    options?: AnnotationToolOptions,
  ) => void;
  setAnnotationStyle: (
    toolId: AnnotationToolId,
    options?: AnnotationToolOptions,
  ) => void;
  getSelectedAnnotation: () => AnnotationSelection | null;
  deselectAnnotation: () => void;
  updateAnnotation: (
    pageIndex: number,
    annotationId: string,
    patch: AnnotationPatch,
  ) => void;
  deleteAnnotation?: (pageIndex: number, annotationId: string) => void;
  deleteAnnotations?: (
    annotations: Array<{ pageIndex: number; id: string }>,
  ) => void;
  createAnnotation?: (
    pageIndex: number,
    annotation: Record<string, unknown>,
  ) => void;
  getSelectedAnnotations?: () => AnnotationSelection[];
  deactivateTools: () => void;
  onAnnotationEvent?: (
    listener: (event: AnnotationEvent) => void,
  ) => void | (() => void);
  getActiveTool?: () => { id: AnnotationToolId } | null;
  purgeAnnotation?: (pageIndex: number, annotationId: string) => void;
  /**
   * Move an annotation to a new position without regenerating its appearance stream.
   * Uses the embedPDF v2.7.0 moveAnnotation API for efficient repositioning of annotations
   * that have existing AP streams (e.g. stamps, signatures).
   */
  moveAnnotation?: (
    pageIndex: number,
    annotationId: string,
    newRect: AnnotationRect,
  ) => void;
}

export interface HistoryAPI {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  subscribe?: (listener: () => void) => () => void;
  /**
   * Purges history entries that match the given predicate based on command metadata.
   * Useful for removing commands that are no longer valid (e.g., after a permanent redaction commit).
   * Added in embedPDF v2.4.0+
   * @param predicate A function that returns true for commands that should be purged
   * @param topic If provided, only purges entries for that specific topic
   * @returns The number of entries that were purged
   */
  purgeByMetadata?: <T>(
    predicate: (metadata: T | undefined) => boolean,
    topic?: string,
  ) => number;
}

export type AnnotationToolId =
  | "select"
  | "highlight"
  | "underline"
  | "strikeout"
  | "squiggly"
  | "ink"
  | "inkHighlighter"
  | "text"
  | "note"
  | "textComment"
  | "insertText"
  | "replaceText"
  | "square"
  | "circle"
  | "line"
  | "lineArrow"
  | "polyline"
  | "polygon"
  | "stamp"
  | "signatureStamp"
  | "signatureInk";

// Import for internal use within this file, and re-export for external consumers
import type { AnnotationEvent } from "@embedpdf/plugin-annotation";
export type { AnnotationEvent } from "@embedpdf/plugin-annotation";

export type AnnotationPatch = Record<string, unknown>;

/** Annotation object as returned by the EmbedPDF annotation API */
export interface AnnotationObject {
  id?: string;
  uid?: string;
  pageIndex?: number;
  type?: number;
  subtype?: number;
  inkList?: unknown;
  color?: string;
  strokeColor?: string;
  fillColor?: string;
  backgroundColor?: string;
  textColor?: string;
  opacity?: number;
  strokeWidth?: number;
  borderWidth?: number;
  lineWidth?: number;
  thickness?: number;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  interiorColor?: string;
  textAlign?: number;
  endStyle?: string;
  startStyle?: string;
  lineEndingStyles?: { start?: string; end?: string };
  customData?: { toolId?: string; annotationToolId?: string };
  rect?: AnnotationRect;
  contents?: string;
}

/**
 * Selection returned by getSelectedAnnotation — EmbedPDF may wrap the annotation
 * in an `.object` property or surface fields directly on the selection.
 */
export type AnnotationSelection = AnnotationObject & {
  object?: AnnotationObject;
};

export interface AnnotationToolOptions {
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  opacity?: number;
  strokeOpacity?: number;
  fillOpacity?: number;
  thickness?: number;
  borderWidth?: number;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: number; // 0 = Left, 1 = Center, 2 = Right
  imageSrc?: string;
  imageSize?: { width: number; height: number };
  icon?:
    | "Comment"
    | "Key"
    | "Note"
    | "Help"
    | "NewParagraph"
    | "Paragraph"
    | "Insert";
  contents?: string;
  customData?: Record<string, unknown>;
  flags?: (
    | "invisible"
    | "hidden"
    | "print"
    | "noZoom"
    | "noRotate"
    | "noView"
    | "readOnly"
    | "locked"
    | "toggleNoView"
  )[];
}
