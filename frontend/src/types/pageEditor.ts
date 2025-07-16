export interface PDFPage {
  id: string;
  pageNumber: number;
  thumbnail: string | null;
  rotation: number;
  selected: boolean;
  splitBefore?: boolean;
}

export interface PDFDocument {
  id: string;
  name: string;
  file: File;
  pages: PDFPage[];
  totalPages: number;
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
