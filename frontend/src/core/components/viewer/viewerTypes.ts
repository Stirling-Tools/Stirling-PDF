import type { PdfAnnotationObject } from '@embedpdf/models';

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
  getPageAnnotations: (pageIndex: number) => Promise<PdfAnnotationObject[]>;
}

export interface HistoryAPI {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export interface AnnotationEvent {
  type: 'create' | 'update' | 'delete' | 'loaded';
  annotation?: PdfAnnotationObject;
  pageIndex?: number;
  committed?: boolean;
  annotations?: PdfAnnotationObject[];
  total?: number;
}
