export interface SignatureAPI {
  addImageSignature: (
    signatureData: string,
    x: number,
    y: number,
    width: number,
    height: number,
    pageIndex: number
  ) => void;
  activateDrawMode: () => void;
  activateSignaturePlacementMode: () => void;
  activateDeleteMode: () => void;
  deleteAnnotation: (annotationId: string, pageIndex: number) => void;
  updateDrawSettings: (color: string, size: number) => void;
  deactivateTools: () => void;
  getPageAnnotations: (pageIndex: number) => Promise<any[]>;
}

export interface AnnotationAPI {
  activateAnnotationTool: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => void;
  setAnnotationStyle: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => void;
  getSelectedAnnotation: () => AnnotationSelection | null;
  deselectAnnotation: () => void;
  updateAnnotation: (pageIndex: number, annotationId: string, patch: AnnotationPatch) => void;
  deactivateTools: () => void;
  onAnnotationEvent?: (listener: (event: AnnotationEvent) => void) => void | (() => void);
  getActiveTool?: () => { id: AnnotationToolId } | null;
  purgeAnnotation?: (pageIndex: number, annotationId: string) => void;
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
  purgeByMetadata?: <T>(predicate: (metadata: T | undefined) => boolean, topic?: string) => number;
}

export type AnnotationToolId =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'squiggly'
  | 'ink'
  | 'inkHighlighter'
  | 'text'
  | 'note'
  | 'square'
  | 'circle'
  | 'line'
  | 'lineArrow'
  | 'polyline'
  | 'polygon'
  | 'stamp'
  | 'signatureStamp'
  | 'signatureInk';

export interface AnnotationEvent {
  type: string;
  [key: string]: unknown;
}

export type AnnotationPatch = Record<string, unknown>;
export type AnnotationSelection = unknown;

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
  icon?: 'Comment' | 'Key' | 'Note' | 'Help' | 'NewParagraph' | 'Paragraph' | 'Insert';
  contents?: string;
  customData?: Record<string, unknown>;
}
