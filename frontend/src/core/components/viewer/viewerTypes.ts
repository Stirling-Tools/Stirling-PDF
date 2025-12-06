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
  activateAnnotationTool?: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => void;
  setAnnotationStyle?: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => void;
  getSelectedAnnotation?: () => any | null;
  deselectAnnotation?: () => void;
  updateAnnotation?: (pageIndex: number, annotationId: string, patch: Partial<any>) => void;
}

export interface AnnotationAPI {
  activateAnnotationTool: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => void;
  setAnnotationStyle: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => void;
  getSelectedAnnotation: () => any | null;
  deselectAnnotation: () => void;
  updateAnnotation: (pageIndex: number, annotationId: string, patch: Partial<any>) => void;
  deactivateTools: () => void;
}

export interface HistoryAPI {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  subscribe?: (listener: () => void) => () => void;
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

export interface AnnotationToolOptions {
  color?: string;
  fillColor?: string;
  opacity?: number;
  strokeOpacity?: number;
  fillOpacity?: number;
  thickness?: number;
  fontSize?: number;
  fontFamily?: string;
  imageSrc?: string;
}
