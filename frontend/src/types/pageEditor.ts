export interface PDFPage {
  id: string;
  pageNumber: number;
  originalPageNumber: number;
  thumbnail: string | null;
  rotation: number;
  selected: boolean;
  splitAfter?: boolean;
}

export interface PDFDocument {
  id: string;
  name: string;
  file: File;
  pages: PDFPage[];
  totalPages: number;
  destroy?: () => void;
}

export interface PageOperation {
  id: string;
  type: 'rotate' | 'delete' | 'move' | 'split' | 'insert' | 'reorder';
  pageIds: string[];
  timestamp: number;
  status: 'pending' | 'applied' | 'failed';
  data?: any;
  metadata?: {
    rotation?: number;
    fromPosition?: number;
    toPosition?: number;
    splitType?: string;
    insertAfterPage?: number;
    error?: string;
  };
}

export interface UndoRedoState {
  operations: PageOperation[];
  currentIndex: number;
}

export interface PageEditorFunctions {
  closePdf: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handleRotate: (direction: 'left' | 'right') => void;
  handleDelete: () => void;
  handleSplit: () => void;
  handleSplitAll: () => void;
  onExportSelected: () => void;
  onExportAll: () => void;
  exportLoading: boolean;
  selectionMode: boolean;
  selectedPages: number[];
  splitPositions: Set<number>;
  totalPages: number;
}
