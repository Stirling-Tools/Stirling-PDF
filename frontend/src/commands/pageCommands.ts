import { Command, CommandSequence } from '../hooks/useUndoRedo';
import { PDFDocument, PDFPage } from '../types/pageEditor';

// Base class for page operations
abstract class PageCommand implements Command {
  protected pdfDocument: PDFDocument;
  protected setPdfDocument: (doc: PDFDocument) => void;
  protected previousState: PDFDocument;
  
  constructor(
    pdfDocument: PDFDocument, 
    setPdfDocument: (doc: PDFDocument) => void
  ) {
    this.pdfDocument = pdfDocument;
    this.setPdfDocument = setPdfDocument;
    this.previousState = JSON.parse(JSON.stringify(pdfDocument)); // Deep clone
  }

  abstract execute(): void;
  abstract description: string;

  undo(): void {
    this.setPdfDocument(this.previousState);
  }
}

// Rotate pages command
export class RotatePagesCommand extends PageCommand {
  private pageIds: string[];
  private rotation: number;
  
  constructor(
    pdfDocument: PDFDocument,
    setPdfDocument: (doc: PDFDocument) => void,
    pageIds: string[],
    rotation: number
  ) {
    super(pdfDocument, setPdfDocument);
    this.pageIds = pageIds;
    this.rotation = rotation;
  }

  execute(): void {
    const updatedPages = this.pdfDocument.pages.map(page => {
      if (this.pageIds.includes(page.id)) {
        return { ...page, rotation: page.rotation + this.rotation };
      }
      return page;
    });
    
    this.setPdfDocument({ ...this.pdfDocument, pages: updatedPages });
  }

  get description(): string {
    const direction = this.rotation > 0 ? 'right' : 'left';
    return `Rotate ${this.pageIds.length} page(s) ${direction}`;
  }
}

// Delete pages command
export class DeletePagesCommand extends PageCommand {
  private pageIds: string[];
  private deletedPages: PDFPage[];
  private deletedPositions: Map<string, number>;
  
  constructor(
    pdfDocument: PDFDocument,
    setPdfDocument: (doc: PDFDocument) => void,
    pageIds: string[]
  ) {
    super(pdfDocument, setPdfDocument);
    this.pageIds = pageIds;
    this.deletedPages = [];
    this.deletedPositions = new Map();
  }

  execute(): void {
    // Store deleted pages and their positions for undo
    this.deletedPages = this.pdfDocument.pages.filter(page => 
      this.pageIds.includes(page.id)
    );
    
    this.deletedPages.forEach(page => {
      const index = this.pdfDocument.pages.findIndex(p => p.id === page.id);
      this.deletedPositions.set(page.id, index);
    });
    
    const updatedPages = this.pdfDocument.pages
      .filter(page => !this.pageIds.includes(page.id))
      .map((page, index) => ({ ...page, pageNumber: index + 1 }));
    
    this.setPdfDocument({ 
      ...this.pdfDocument, 
      pages: updatedPages, 
      totalPages: updatedPages.length 
    });
  }

  undo(): void {
    let restoredPages = [...this.pdfDocument.pages];
    
    // Insert deleted pages back at their original positions
    this.deletedPages
      .sort((a, b) => (this.deletedPositions.get(a.id) || 0) - (this.deletedPositions.get(b.id) || 0))
      .forEach(page => {
        const originalIndex = this.deletedPositions.get(page.id) || 0;
        restoredPages.splice(originalIndex, 0, page);
      });
    
    // Update page numbers
    restoredPages = restoredPages.map((page, index) => ({ 
      ...page, 
      pageNumber: index + 1 
    }));
    
    this.setPdfDocument({ 
      ...this.pdfDocument, 
      pages: restoredPages, 
      totalPages: restoredPages.length 
    });
  }

  get description(): string {
    return `Delete ${this.pageIds.length} page(s)`;
  }
}

// Move pages command
export class MovePagesCommand extends PageCommand {
  private pageIds: string[];
  private targetIndex: number;
  private originalIndices: Map<string, number>;
  
  constructor(
    pdfDocument: PDFDocument,
    setPdfDocument: (doc: PDFDocument) => void,
    pageIds: string[],
    targetIndex: number
  ) {
    super(pdfDocument, setPdfDocument);
    this.pageIds = pageIds;
    this.targetIndex = targetIndex;
    this.originalIndices = new Map();
  }

  execute(): void {
    // Store original positions
    this.pageIds.forEach(pageId => {
      const index = this.pdfDocument.pages.findIndex(p => p.id === pageId);
      this.originalIndices.set(pageId, index);
    });
    
    let newPages = [...this.pdfDocument.pages];
    const pagesToMove = this.pageIds
      .map(id => this.pdfDocument.pages.find(p => p.id === id))
      .filter((page): page is PDFPage => page !== undefined);
    
    // Remove pages to move
    newPages = newPages.filter(page => !this.pageIds.includes(page.id));
    
    // Insert pages at target position
    newPages.splice(this.targetIndex, 0, ...pagesToMove);
    
    // Update page numbers
    newPages = newPages.map((page, index) => ({ 
      ...page, 
      pageNumber: index + 1 
    }));
    
    this.setPdfDocument({ ...this.pdfDocument, pages: newPages });
  }

  get description(): string {
    return `Move ${this.pageIds.length} page(s)`;
  }
}

// Reorder single page command (for drag-and-drop)
export class ReorderPageCommand extends PageCommand {
  private pageId: string;
  private targetIndex: number;
  private originalIndex: number;
  
  constructor(
    pdfDocument: PDFDocument,
    setPdfDocument: (doc: PDFDocument) => void,
    pageId: string,
    targetIndex: number
  ) {
    super(pdfDocument, setPdfDocument);
    this.pageId = pageId;
    this.targetIndex = targetIndex;
    this.originalIndex = pdfDocument.pages.findIndex(p => p.id === pageId);
  }

  execute(): void {
    const newPages = [...this.pdfDocument.pages];
    const [movedPage] = newPages.splice(this.originalIndex, 1);
    newPages.splice(this.targetIndex, 0, movedPage);
    
    // Update page numbers
    const updatedPages = newPages.map((page, index) => ({ 
      ...page, 
      pageNumber: index + 1 
    }));
    
    this.setPdfDocument({ ...this.pdfDocument, pages: updatedPages });
  }

  get description(): string {
    return `Reorder page ${this.originalIndex + 1} to position ${this.targetIndex + 1}`;
  }
}

// Toggle split markers command
export class ToggleSplitCommand extends PageCommand {
  private pageIds: string[];
  private previousSplitStates: Map<string, boolean>;
  
  constructor(
    pdfDocument: PDFDocument,
    setPdfDocument: (doc: PDFDocument) => void,
    pageIds: string[]
  ) {
    super(pdfDocument, setPdfDocument);
    this.pageIds = pageIds;
    this.previousSplitStates = new Map();
  }

  execute(): void {
    // Store previous split states
    this.pageIds.forEach(pageId => {
      const page = this.pdfDocument.pages.find(p => p.id === pageId);
      if (page) {
        this.previousSplitStates.set(pageId, !!page.splitBefore);
      }
    });
    
    const updatedPages = this.pdfDocument.pages.map(page => {
      if (this.pageIds.includes(page.id)) {
        return { ...page, splitBefore: !page.splitBefore };
      }
      return page;
    });
    
    this.setPdfDocument({ ...this.pdfDocument, pages: updatedPages });
  }

  undo(): void {
    const updatedPages = this.pdfDocument.pages.map(page => {
      if (this.pageIds.includes(page.id)) {
        const previousState = this.previousSplitStates.get(page.id);
        return { ...page, splitBefore: previousState };
      }
      return page;
    });
    
    this.setPdfDocument({ ...this.pdfDocument, pages: updatedPages });
  }

  get description(): string {
    return `Toggle split markers for ${this.pageIds.length} page(s)`;
  }
}

// Add pages command (for inserting new files)
export class AddPagesCommand extends PageCommand {
  private newPages: PDFPage[];
  private insertIndex: number;
  
  constructor(
    pdfDocument: PDFDocument,
    setPdfDocument: (doc: PDFDocument) => void,
    newPages: PDFPage[],
    insertIndex: number = -1 // -1 means append to end
  ) {
    super(pdfDocument, setPdfDocument);
    this.newPages = newPages;
    this.insertIndex = insertIndex === -1 ? pdfDocument.pages.length : insertIndex;
  }

  execute(): void {
    const newPagesArray = [...this.pdfDocument.pages];
    newPagesArray.splice(this.insertIndex, 0, ...this.newPages);
    
    // Update page numbers for all pages
    const updatedPages = newPagesArray.map((page, index) => ({ 
      ...page, 
      pageNumber: index + 1 
    }));
    
    this.setPdfDocument({ 
      ...this.pdfDocument, 
      pages: updatedPages,
      totalPages: updatedPages.length
    });
  }

  undo(): void {
    const updatedPages = this.pdfDocument.pages
      .filter(page => !this.newPages.some(newPage => newPage.id === page.id))
      .map((page, index) => ({ ...page, pageNumber: index + 1 }));
    
    this.setPdfDocument({ 
      ...this.pdfDocument, 
      pages: updatedPages,
      totalPages: updatedPages.length
    });
  }

  get description(): string {
    return `Add ${this.newPages.length} page(s)`;
  }
}

// Command sequence for bulk operations
export class PageCommandSequence implements CommandSequence {
  commands: Command[];
  description: string;
  
  constructor(commands: Command[], description?: string) {
    this.commands = commands;
    this.description = description || `Execute ${commands.length} operations`;
  }

  execute(): void {
    this.commands.forEach(command => command.execute());
  }

  undo(): void {
    // Undo in reverse order
    [...this.commands].reverse().forEach(command => command.undo());
  }
}