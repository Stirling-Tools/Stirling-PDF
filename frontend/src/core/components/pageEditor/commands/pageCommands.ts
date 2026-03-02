import { FileId } from '@app/types/file';
import { PDFDocument, PDFPage, PageBreakSettings } from '@app/types/pageEditor';

// V1-style DOM-first command system (replaces the old React state commands)
export abstract class DOMCommand {
  abstract execute(): void;
  abstract undo(): void;
  abstract description: string;
}

export class RotatePageCommand extends DOMCommand {
  constructor(
    private pageId: string,
    private degrees: number
  ) {
    super();
  }

  execute(): void {
    const pageElement = document.querySelector(`[data-page-id="${this.pageId}"]`);
    if (pageElement) {
      const img = pageElement.querySelector('img');
      if (img) {
        const currentTransform = img.style.transform || '';
        const rotateMatch = currentTransform.match(/rotate\(([^)]+)\)/);
        const currentRotation = rotateMatch ? parseInt(rotateMatch[1]) : 0;
        let newRotation = currentRotation + this.degrees;

        newRotation = ((newRotation % 360) + 360) % 360;

        img.style.transform = `rotate(${newRotation}deg)`;
      }
    }
  }

  undo(): void {
    const pageElement = document.querySelector(`[data-page-id="${this.pageId}"]`);
    if (pageElement) {
      const img = pageElement.querySelector('img');
      if (img) {
        const currentTransform = img.style.transform || '';
        const rotateMatch = currentTransform.match(/rotate\(([^)]+)\)/);
        const currentRotation = rotateMatch ? parseInt(rotateMatch[1]) : 0;
        let previousRotation = currentRotation - this.degrees;

        previousRotation = ((previousRotation % 360) + 360) % 360;

        img.style.transform = `rotate(${previousRotation}deg)`;
      }
    }
  }

  get description(): string {
    return `Rotate page ${this.degrees > 0 ? 'right' : 'left'}`;
  }
}

export class DeletePagesCommand extends DOMCommand {
  private originalDocument: PDFDocument | null = null;
  private originalSplitPositions: Set<string> = new Set();
  private originalSelectedPages: number[] = [];
  private hasExecuted: boolean = false;
  private pageIdsToDelete: string[] = [];
  private onAllPagesDeleted?: () => void;

  constructor(
    private pagesToDelete: number[],
    private getCurrentDocument: () => PDFDocument | null,
    private setDocument: (doc: PDFDocument) => void,
    private setSelectedPageIds: (pageIds: string[]) => void,
    private getSplitPositions: () => Set<string>,
    private setSplitPositions: (positions: Set<string>) => void,
    private getSelectedPages: () => number[],
    onAllPagesDeleted?: () => void
  ) {
    super();
    this.onAllPagesDeleted = onAllPagesDeleted;
  }

  execute(): void {
    const currentDoc = this.getCurrentDocument();
    if (!currentDoc || this.pagesToDelete.length === 0) return;

    // Store complete original state for undo (only on first execution)
    if (!this.hasExecuted) {
      this.originalDocument = {
        ...currentDoc,
        pages: currentDoc.pages.map(page => ({...page})) // Deep copy pages
      };
      this.originalSplitPositions = new Set(this.getSplitPositions());
      this.originalSelectedPages = [...this.getSelectedPages()];

      // Convert page numbers to page IDs for stable identification
      this.pageIdsToDelete = this.pagesToDelete.map(pageNum => {
        const page = currentDoc.pages.find(p => p.pageNumber === pageNum);
        return page?.id || '';
      }).filter(id => id);

      this.hasExecuted = true;
    }

    const selectedPageNumbersBefore = this.getSelectedPages();
    const selectedIdSet = new Set(
      selectedPageNumbersBefore
        .map((pageNum) => currentDoc.pages.find((p) => p.pageNumber === pageNum)?.id)
        .filter((id): id is string => Boolean(id))
    );

    // Filter out deleted pages by ID (stable across undo/redo)
    const remainingPages = currentDoc.pages.filter(page =>
      !this.pageIdsToDelete.includes(page.id)
    );

    if (remainingPages.length === 0) {
      // If all pages would be deleted, clear selection/splits and close PDF
      this.setSelectedPageIds([]);
      this.setSplitPositions(new Set());
      this.onAllPagesDeleted?.();
      return;
    }

    // Renumber remaining pages
    remainingPages.forEach((page, index) => {
      page.pageNumber = index + 1;
    });

    // Update document
    const updatedDocument: PDFDocument = {
      ...currentDoc,
      pages: remainingPages,
      totalPages: remainingPages.length,
    };

    // Adjust split positions
    const currentSplitPositions = this.getSplitPositions();
    const remainingIndexMap = new Map<string, number>();
    remainingPages.forEach((page, index) => {
      remainingIndexMap.set(page.id, index);
    });
    const newPositions = new Set<string>();
    currentSplitPositions.forEach((pageId) => {
      const splitIndex = remainingIndexMap.get(pageId);
      if (splitIndex !== undefined && splitIndex < remainingPages.length - 1) {
        newPositions.add(pageId);
      }
    });

    // Apply changes
    this.setDocument(updatedDocument);

    const remainingSelectedPageIds = remainingPages
      .filter((page) => selectedIdSet.has(page.id))
      .map((page) => page.id);
    this.setSelectedPageIds(remainingSelectedPageIds);

    this.setSplitPositions(newPositions);
  }

  undo(): void {
    if (!this.originalDocument) return;

    // Simply restore the complete original document state
    this.setDocument(this.originalDocument);
    this.setSplitPositions(this.originalSplitPositions);
    const restoredIds = this.originalSelectedPages
      .map((pageNum) =>
        this.originalDocument!.pages.find((page) => page.pageNumber === pageNum)?.id || ""
      )
      .filter((id) => id !== "");
    this.setSelectedPageIds(restoredIds);
  }

  get description(): string {
    return `Delete ${this.pagesToDelete.length} page(s)`;
  }
}

export class ReorderPagesCommand extends DOMCommand {
  private originalPages: PDFPage[] = [];

  constructor(
    private sourcePageNumber: number,
    private targetIndex: number,
    private selectedPages: number[] | undefined,
    private getCurrentDocument: () => PDFDocument | null,
    private setDocument: (doc: PDFDocument) => void,
    private onReorderComplete?: (newPages: PDFPage[]) => void
  ) {
    super();
  }

  execute(): void {
    const currentDoc = this.getCurrentDocument();
    if (!currentDoc) return;

    // Store original state for undo
    this.originalPages = currentDoc.pages.map(page => ({...page}));

    // Perform the reorder
    const sourceIndex = currentDoc.pages.findIndex(p => p.pageNumber === this.sourcePageNumber);
    if (sourceIndex === -1) return;

    const newPages = [...currentDoc.pages];

    if (this.selectedPages && this.selectedPages.length > 1 && this.selectedPages.includes(this.sourcePageNumber)) {
      // Multi-page reorder
      const selectedPageObjects = this.selectedPages
        .map(pageNum => currentDoc.pages.find(p => p.pageNumber === pageNum))
        .filter(page => page !== undefined) as PDFPage[];

      const remainingPages = newPages.filter(page => !this.selectedPages!.includes(page.pageNumber));
      remainingPages.splice(this.targetIndex, 0, ...selectedPageObjects);

      remainingPages.forEach((page, index) => {
        page.pageNumber = index + 1;
      });

      newPages.splice(0, newPages.length, ...remainingPages);
    } else {
      // Single page reorder
      const [movedPage] = newPages.splice(sourceIndex, 1);

      // Adjust target index if moving forward (after removal, indices shift)
      const adjustedTargetIndex = sourceIndex < this.targetIndex
        ? this.targetIndex - 1
        : this.targetIndex;

      newPages.splice(adjustedTargetIndex, 0, movedPage);

      newPages.forEach((page, index) => {
        page.pageNumber = index + 1;
      });
    }

    const reorderedDocument: PDFDocument = {
      ...currentDoc,
      pages: newPages,
      totalPages: newPages.length,
    };

    this.setDocument(reorderedDocument);

    // Notify that reordering is complete
    if (this.onReorderComplete) {
      this.onReorderComplete(newPages);
    }
  }

  undo(): void {
    const currentDoc = this.getCurrentDocument();
    if (!currentDoc || this.originalPages.length === 0) return;

    // Restore original page order
    const restoredDocument: PDFDocument = {
      ...currentDoc,
      pages: this.originalPages,
      totalPages: this.originalPages.length,
    };

    this.setDocument(restoredDocument);
  }

  get description(): string {
    return `Reorder page(s)`;
  }
}

export class SplitCommand extends DOMCommand {
  private originalSplitPositions: Set<string> = new Set();

  constructor(
    private pageId: string,
    private pageNumber: number,
    private getSplitPositions: () => Set<string>,
    private setSplitPositions: (positions: Set<string>) => void
  ) {
    super();
  }

  execute(): void {
    // Store original state for undo
    this.originalSplitPositions = new Set(this.getSplitPositions());

    // Toggle the split position
    const currentPositions = this.getSplitPositions();
    const newPositions = new Set(currentPositions);

    if (newPositions.has(this.pageId)) {
      newPositions.delete(this.pageId);
    } else {
      newPositions.add(this.pageId);
    }

    this.setSplitPositions(newPositions);
  }

  undo(): void {
    // Restore original split positions
    this.setSplitPositions(this.originalSplitPositions);
  }

  get description(): string {
    const currentPositions = this.getSplitPositions();
    const willAdd = !currentPositions.has(this.pageId);
    return `${willAdd ? 'Add' : 'Remove'} split at position ${this.pageNumber}`;
  }
}

export class BulkRotateCommand extends DOMCommand {
  private originalRotations: Map<string, number> = new Map();

  constructor(
    private pageIds: string[],
    private degrees: number
  ) {
    super();
  }

  execute(): void {
    this.pageIds.forEach(pageId => {
      const pageElement = document.querySelector(`[data-page-id="${pageId}"]`);
      if (pageElement) {
        const img = pageElement.querySelector('img');
        if (img) {
          // Store original rotation for undo (only on first execution)
          if (!this.originalRotations.has(pageId)) {
            const currentTransform = img.style.transform || '';
            const rotateMatch = currentTransform.match(/rotate\(([^)]+)\)/);
            const currentRotation = rotateMatch ? parseInt(rotateMatch[1]) : 0;
            this.originalRotations.set(pageId, currentRotation);
          }

          // Apply rotation using transform to trigger CSS animation
          const currentTransform = img.style.transform || '';
          const rotateMatch = currentTransform.match(/rotate\(([^)]+)\)/);
          const currentRotation = rotateMatch ? parseInt(rotateMatch[1]) : 0;
          const newRotation = currentRotation + this.degrees;
          img.style.transform = `rotate(${newRotation}deg)`;
        }
      }
    });
  }

  undo(): void {
    this.pageIds.forEach(pageId => {
      const pageElement = document.querySelector(`[data-page-id="${pageId}"]`);
      if (pageElement) {
        const img = pageElement.querySelector('img');
        if (img && this.originalRotations.has(pageId)) {
          img.style.transform = `rotate(${this.originalRotations.get(pageId)}deg)`;
        }
      }
    });
  }

  get description(): string {
    return `Rotate ${this.pageIds.length} page(s) ${this.degrees > 0 ? 'right' : 'left'}`;
  }
}

export class BulkSplitCommand extends DOMCommand {
  private originalSplitPositions: Set<number> = new Set();

  constructor(
    private positions: number[],
    private getSplitPositions: () => Set<number>,
    private setSplitPositions: (positions: Set<number>) => void
  ) {
    super();
  }

  execute(): void {
    // Store original state for undo (only on first execution)
    if (this.originalSplitPositions.size === 0) {
      this.originalSplitPositions = new Set(this.getSplitPositions());
    }

    // Toggle each position
    const currentPositions = new Set(this.getSplitPositions());
    this.positions.forEach(position => {
      if (currentPositions.has(position)) {
        currentPositions.delete(position);
      } else {
        currentPositions.add(position);
      }
    });

    this.setSplitPositions(currentPositions);
  }

  undo(): void {
    // Restore original split positions
    this.setSplitPositions(this.originalSplitPositions);
  }

  get description(): string {
    return `Toggle ${this.positions.length} split position(s)`;
  }
}

export class SplitAllCommand extends DOMCommand {
  private originalSplitPositions: Set<number> = new Set();
  private allPossibleSplits: Set<number> = new Set();

  constructor(
    private totalPages: number,
    private getSplitPositions: () => Set<number>,
    private setSplitPositions: (positions: Set<number>) => void
  ) {
    super();
    // Calculate all possible split positions (between pages, not after last page)
    for (let i = 0; i < this.totalPages - 1; i++) {
      this.allPossibleSplits.add(i);
    }
  }

  execute(): void {
    // Store original state for undo
    this.originalSplitPositions = new Set(this.getSplitPositions());

    // Check if all splits are already active
    const currentSplits = this.getSplitPositions();
    const hasAllSplits = Array.from(this.allPossibleSplits).every(pos => currentSplits.has(pos));

    if (hasAllSplits) {
      // Remove all splits
      this.setSplitPositions(new Set());
    } else {
      // Add all splits
      this.setSplitPositions(this.allPossibleSplits);
    }
  }

  undo(): void {
    // Restore original split positions
    this.setSplitPositions(this.originalSplitPositions);
  }

  get description(): string {
    const currentSplits = this.getSplitPositions();
    const hasAllSplits = Array.from(this.allPossibleSplits).every(pos => currentSplits.has(pos));
    return hasAllSplits ? 'Remove all splits' : 'Split all pages';
  }
}

// PageBreakSettings, PageSize, and PageOrientation are now imported from pageEditor.ts

export class PageBreakCommand extends DOMCommand {
  private insertedPages: PDFPage[] = [];
  private originalDocument: PDFDocument | null = null;

  constructor(
    private selectedPageNumbers: number[],
    private getCurrentDocument: () => PDFDocument | null,
    private setDocument: (doc: PDFDocument) => void,
    private settings?: PageBreakSettings
  ) {
    super();
  }

  execute(): void {
    const currentDoc = this.getCurrentDocument();
    if (!currentDoc || this.selectedPageNumbers.length === 0) return;

    // Store original state for undo
    this.originalDocument = {
      ...currentDoc,
      pages: currentDoc.pages.map(page => ({...page}))
    };

    // Create new pages array with blank pages inserted
    const newPages: PDFPage[] = [];
    this.insertedPages = [];
    let pageNumberCounter = 1;

    currentDoc.pages.forEach((page, index) => {
      // Add the current page
      const updatedPage = { ...page, pageNumber: pageNumberCounter++ };
      newPages.push(updatedPage);

      // If this page is selected for page break insertion, add a blank page after it
      if (this.selectedPageNumbers.includes(page.pageNumber)) {
        const blankPage: PDFPage = {
          id: `blank-${Date.now()}-${index}`,
          pageNumber: pageNumberCounter++,
          originalPageNumber: -1, // Mark as blank page
          thumbnail: null,
          rotation: 0,
          selected: false,
          splitAfter: false,
          isBlankPage: true, // Custom flag for blank pages
          pageBreakSettings: this.settings // Store settings for export
        };
        newPages.push(blankPage);
        this.insertedPages.push(blankPage);
      }
    });

    // Update document
    const updatedDocument: PDFDocument = {
      ...currentDoc,
      pages: newPages,
      totalPages: newPages.length,
    };

    this.setDocument(updatedDocument);

    // No need to maintain selection - page IDs remain stable, so selection persists automatically
  }

  undo(): void {
    if (!this.originalDocument) return;
    this.setDocument(this.originalDocument);
  }

  get description(): string {
    return `Insert ${this.selectedPageNumbers.length} page break(s)`;
  }
}

export class BulkPageBreakCommand extends DOMCommand {
  private insertedPages: PDFPage[] = [];
  private originalDocument: PDFDocument | null = null;
  private originalSelectedPages: number[] = [];

  constructor(
    private getCurrentDocument: () => PDFDocument | null,
    private setDocument: (doc: PDFDocument) => void,
    private setSelectedPages: (pages: number[]) => void,
    private getSelectedPages: () => number[]
  ) {
    super();
  }

  execute(): void {
    const currentDoc = this.getCurrentDocument();
    if (!currentDoc) return;

    // Store original selection to restore later
    this.originalSelectedPages = this.getSelectedPages();

    // Store original state for undo
    this.originalDocument = {
      ...currentDoc,
      pages: currentDoc.pages.map(page => ({...page}))
    };

    // Create new pages array with blank pages inserted after each page (except the last)
    const newPages: PDFPage[] = [];
    this.insertedPages = [];
    let pageNumberCounter = 1;

    currentDoc.pages.forEach((page, index) => {
      // Add the current page
      const updatedPage = { ...page, pageNumber: pageNumberCounter++ };
      newPages.push(updatedPage);

      // Add blank page after each page except the last one
      if (index < currentDoc.pages.length - 1) {
        const blankPage: PDFPage = {
          id: `blank-${Date.now()}-${index}`,
          pageNumber: pageNumberCounter++,
          originalPageNumber: -1,
          thumbnail: null,
          rotation: 0,
          selected: false,
          splitAfter: false,
          isBlankPage: true
        };
        newPages.push(blankPage);
        this.insertedPages.push(blankPage);
      }
    });

    // Update document
    const updatedDocument: PDFDocument = {
      ...currentDoc,
      pages: newPages,
      totalPages: newPages.length,
    };

    this.setDocument(updatedDocument);

    // Maintain existing selection by mapping original selected pages to their new positions
    const updatedSelection: number[] = [];
    this.originalSelectedPages.forEach(originalPageNum => {
      // Find the original page by matching the page ID from the original document
      const originalPage = this.originalDocument?.pages[originalPageNum - 1];
      if (originalPage) {
        const foundPage = newPages.find(page => page.id === originalPage.id && !page.isBlankPage);
        if (foundPage) {
          updatedSelection.push(foundPage.pageNumber);
        }
      }
    });
    this.setSelectedPages(updatedSelection);
  }

  undo(): void {
    if (!this.originalDocument) return;
    this.setDocument(this.originalDocument);
  }

  get description(): string {
    return `Insert page breaks after all pages`;
  }
}

export class InsertFilesCommand extends DOMCommand {
  private insertedPages: PDFPage[] = [];
  private originalDocument: PDFDocument | null = null;
  private fileDataMap = new Map<FileId, ArrayBuffer>(); // Store file data for thumbnail generation
  private originalProcessedFile: any = null; // Store original ProcessedFile for undo
  private insertedFileMap = new Map<FileId, File>(); // Store inserted files for export

  constructor(
    private files: File[],
    private insertAfterPageNumber: number,
    private getCurrentDocument: () => PDFDocument | null,
    private setDocument: (doc: PDFDocument) => void,
    private setSelectedPages: (pages: number[]) => void,
    private getSelectedPages: () => number[],
    private updateFileContext?: (updatedDocument: PDFDocument, insertedFiles?: Map<FileId, File>) => void
  ) {
    super();
  }

  async execute(): Promise<void> {
    const currentDoc = this.getCurrentDocument();
    if (!currentDoc || this.files.length === 0) return;

    // Store original state for undo
    this.originalDocument = {
      ...currentDoc,
      pages: currentDoc.pages.map(page => ({...page}))
    };

    try {
      // Process each file to extract pages and wait for all to complete
      const allNewPages: PDFPage[] = [];

      // Process all files and wait for their completion
      const baseTimestamp = Date.now();
      const extractionPromises = this.files.map(async (file, index) => {
        const fileId = `inserted-${file.name}-${baseTimestamp + index}` as FileId;
        // Store inserted file for export
        this.insertedFileMap.set(fileId, file);
        // Use base timestamp + index to ensure unique but predictable file IDs
        return await this.extractPagesFromFile(file, baseTimestamp + index);
      });

      const extractedPageArrays = await Promise.all(extractionPromises);

      // Flatten all extracted pages
      for (const pages of extractedPageArrays) {
        allNewPages.push(...pages);
      }

      if (allNewPages.length === 0) return;

      // Find insertion point (after the specified page)
      const insertIndex = this.insertAfterPageNumber; // Insert after page N means insert at index N

      // Create new pages array with inserted pages
      const newPages: PDFPage[] = [];
      let pageNumberCounter = 1;

      // Add pages before insertion point
      for (let i = 0; i < insertIndex && i < currentDoc.pages.length; i++) {
        const page = { ...currentDoc.pages[i], pageNumber: pageNumberCounter++ };
        newPages.push(page);
      }

      // Add inserted pages
      for (const newPage of allNewPages) {
        const insertedPage: PDFPage = {
          ...newPage,
          pageNumber: pageNumberCounter++,
          selected: false,
          splitAfter: false
        };
        newPages.push(insertedPage);
        this.insertedPages.push(insertedPage);
      }

      // Add remaining pages after insertion point
      for (let i = insertIndex; i < currentDoc.pages.length; i++) {
        const page = { ...currentDoc.pages[i], pageNumber: pageNumberCounter++ };
        newPages.push(page);
      }

      // Update document
      const updatedDocument: PDFDocument = {
        ...currentDoc,
        pages: newPages,
        totalPages: newPages.length,
      };

      this.setDocument(updatedDocument);

      // Update FileContext with the new document structure and inserted files
      if (this.updateFileContext) {
        this.updateFileContext(updatedDocument, this.insertedFileMap);
      }

      // Generate thumbnails for inserted pages (all files should be read by now)
      this.generateThumbnailsForInsertedPages(updatedDocument);

      // Maintain existing selection by mapping original selected pages to their new positions
      const originalSelection = this.getSelectedPages();
      const updatedSelection: number[] = [];

      originalSelection.forEach(originalPageNum => {
        if (originalPageNum <= this.insertAfterPageNumber) {
          // Pages before insertion point keep same number
          updatedSelection.push(originalPageNum);
        } else {
          // Pages after insertion point are shifted by number of inserted pages
          updatedSelection.push(originalPageNum + allNewPages.length);
        }
      });

      this.setSelectedPages(updatedSelection);

    } catch (error) {
      console.error('Failed to insert files:', error);
      // Revert to original state if error occurs
      if (this.originalDocument) {
        this.setDocument(this.originalDocument);
      }
    }
  }

  private async generateThumbnailsForInsertedPages(updatedDocument: PDFDocument): Promise<void> {
    try {
      const { thumbnailGenerationService } = await import('@app/services/thumbnailGenerationService');

      // Group pages by file ID to generate thumbnails efficiently
      const pagesByFileId = new Map<FileId, PDFPage[]>();

      for (const page of this.insertedPages) {
        const fileId = page.id.substring(0, page.id.lastIndexOf('-page-')) as FileId /* FIX ME: This looks wrong - like we've thrown away info too early and need to recreate it */;
        if (!pagesByFileId.has(fileId)) {
          pagesByFileId.set(fileId, []);
        }
        pagesByFileId.get(fileId)!.push(page);
      }

      // Generate thumbnails for each file
      for (const [fileId, pages] of pagesByFileId) {
        const arrayBuffer = this.fileDataMap.get(fileId);

        console.log('Generating thumbnails for file:', fileId);
        console.log('Pages:', pages.length);
        console.log('ArrayBuffer size:', arrayBuffer?.byteLength || 'undefined');

        try {
          if (arrayBuffer && arrayBuffer.byteLength > 0) {
            // Extract page numbers for all pages from this file
            const pageNumbers = pages.map(page => {
              const pageNumMatch = page.id.match(/-page-(\d+)$/);
              return pageNumMatch ? parseInt(pageNumMatch[1]) : 1;
            });

            console.log('Generating thumbnails for page numbers:', pageNumbers);

            // Generate thumbnails for all pages from this file at once
            const results = await thumbnailGenerationService.generateThumbnails(
              fileId,
              arrayBuffer,
              pageNumbers,
              { scale: 0.2, quality: 0.8 }
            );

            console.log('Thumbnail generation results:', results.length, 'thumbnails generated');

            // Update pages with generated thumbnails
            for (let i = 0; i < results.length && i < pages.length; i++) {
              const result = results[i];
              const page = pages[i];

              if (result.success) {
                const pageIndex = updatedDocument.pages.findIndex(p => p.id === page.id);
                if (pageIndex >= 0) {
                  updatedDocument.pages[pageIndex].thumbnail = result.thumbnail;
                  console.log('Updated thumbnail for page:', page.id);
                }
              }
            }

            // Trigger re-render by updating the document
            this.setDocument({ ...updatedDocument });
          } else {
            console.error('No valid ArrayBuffer found for file ID:', fileId);
          }
        } catch (error) {
          console.error('Failed to generate thumbnails for file:', fileId, error);
        } finally {
          this.fileDataMap.delete(fileId);
        }
      }
    } catch (error) {
      console.error('Failed to generate thumbnails for inserted pages:', error);
    }
  }

  private async extractPagesFromFile(file: File, baseTimestamp: number): Promise<PDFPage[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          console.log('File reader onload - arrayBuffer size:', arrayBuffer?.byteLength || 'undefined');

          if (!arrayBuffer) {
            reject(new Error('Failed to read file'));
            return;
          }

          // Clone the ArrayBuffer before passing to PDF.js (it might consume it)
          const clonedArrayBuffer = arrayBuffer.slice(0);

          // Use PDF.js via the worker manager to extract pages
          const { pdfWorkerManager } = await import('@app/services/pdfWorkerManager');
          const pdf = await pdfWorkerManager.createDocument(clonedArrayBuffer);

          const pageCount = pdf.numPages;
          const pages: PDFPage[] = [];
          const fileId = `inserted-${file.name}-${baseTimestamp}` as FileId;

          console.log('Original ArrayBuffer size:', arrayBuffer.byteLength);
          console.log('Storing ArrayBuffer for fileId:', fileId, 'size:', arrayBuffer.byteLength);

          // Store the original ArrayBuffer for thumbnail generation
          this.fileDataMap.set(fileId, arrayBuffer);

          console.log('After storing - fileDataMap size:', this.fileDataMap.size);
          console.log('Stored value size:', this.fileDataMap.get(fileId)?.byteLength || 'undefined');

          for (let i = 1; i <= pageCount; i++) {
            const pageId = `${fileId}-page-${i}`;
            pages.push({
              id: pageId,
              pageNumber: i, // Will be renumbered in execute()
              originalPageNumber: i,
              thumbnail: null, // Will be generated after insertion
              rotation: 0,
              selected: false,
              splitAfter: false,
              isBlankPage: false
            });
          }

          // Clean up PDF document
          pdfWorkerManager.destroyDocument(pdf);

          resolve(pages);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  undo(): void {
    if (!this.originalDocument) return;
    this.setDocument(this.originalDocument);
  }

  get description(): string {
    return `Insert ${this.files.length} file(s) after page ${this.insertAfterPageNumber}`;
  }
}

// Simple undo manager for DOM commands
export class UndoManager {
  private undoStack: DOMCommand[] = [];
  private redoStack: DOMCommand[] = [];
  private onStateChange?: () => void;

  setStateChangeCallback(callback: () => void): void {
    this.onStateChange = callback;
  }

  executeCommand(command: DOMCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    this.onStateChange?.();
  }

  // For async commands that need to be executed manually
  addToUndoStack(command: DOMCommand): void {
    this.undoStack.push(command);
    this.redoStack = [];
    this.onStateChange?.();
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      this.onStateChange?.();
      return true;
    }
    return false;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
      this.onStateChange?.();
      return true;
    }
    return false;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  hasHistory(): boolean {
    return this.undoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onStateChange?.();
  }
}
