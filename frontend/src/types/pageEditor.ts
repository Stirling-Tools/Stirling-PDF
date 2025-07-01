export interface PDFPage {
  id: string;
  pageNumber: number;
  thumbnail: string;
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
  type: 'rotate' | 'delete' | 'move' | 'split' | 'insert';
  pageIds: string[];
  data?: any;
}

export interface UndoRedoState {
  operations: PageOperation[];
  currentIndex: number;
}