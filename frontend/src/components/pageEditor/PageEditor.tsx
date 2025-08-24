import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Button, Text, Center, Checkbox, Box, Tooltip, ActionIcon,
  Notification, TextInput, LoadingOverlay, Modal, Alert,
  Stack, Group
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileState, useFileActions, useCurrentFile, useFileSelection } from "../../contexts/FileContext";
import { ModeType } from "../../contexts/NavigationContext";
import { PDFDocument, PDFPage } from "../../types/pageEditor";
import { ProcessedFile as EnhancedProcessedFile } from "../../types/processing";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { pdfExportService } from "../../services/pdfExportService";
import { documentManipulationService } from "../../services/documentManipulationService";
import { enhancedPDFProcessingService } from "../../services/enhancedPDFProcessingService";
import { fileProcessingService } from "../../services/fileProcessingService";
import { pdfProcessingService } from "../../services/pdfProcessingService";
import { pdfWorkerManager } from "../../services/pdfWorkerManager";
// Thumbnail generation is now handled by individual PageThumbnail components
import { fileStorage } from "../../services/fileStorage";
import { indexedDBManager, DATABASE_CONFIGS } from "../../services/indexedDBManager";
import './PageEditor.module.css';
import PageThumbnail from './PageThumbnail';
import DragDropGrid from './DragDropGrid';
import SkeletonLoader from '../shared/SkeletonLoader';
import NavigationWarningModal from '../shared/NavigationWarningModal';

// V1-style DOM-first command system (replaces the old React state commands)
abstract class DOMCommand {
  abstract execute(): void;
  abstract undo(): void;
  abstract description: string;
}

class RotatePageCommand extends DOMCommand {
  constructor(
    private pageId: string,
    private degrees: number
  ) {
    super();
  }

  execute(): void {
    // Only update DOM for immediate visual feedback
    const pageElement = document.querySelector(`[data-page-id="${this.pageId}"]`);
    if (pageElement) {
      const img = pageElement.querySelector('img');
      if (img) {
        // Extract current rotation from transform property to match the animated CSS
        const currentTransform = img.style.transform || '';
        const rotateMatch = currentTransform.match(/rotate\(([^)]+)\)/);
        const currentRotation = rotateMatch ? parseInt(rotateMatch[1]) : 0;
        const newRotation = currentRotation + this.degrees;
        img.style.transform = `rotate(${newRotation}deg)`;
      }
    }
  }

  undo(): void {
    // Only update DOM
    const pageElement = document.querySelector(`[data-page-id="${this.pageId}"]`);
    if (pageElement) {
      const img = pageElement.querySelector('img');
      if (img) {
        // Extract current rotation from transform property
        const currentTransform = img.style.transform || '';
        const rotateMatch = currentTransform.match(/rotate\(([^)]+)\)/);
        const currentRotation = rotateMatch ? parseInt(rotateMatch[1]) : 0;
        const previousRotation = currentRotation - this.degrees;
        img.style.transform = `rotate(${previousRotation}deg)`;
      }
    }
  }

  get description(): string {
    return `Rotate page ${this.degrees > 0 ? 'right' : 'left'}`;
  }
}

class DeletePagesCommand extends DOMCommand {
  private originalDocument: PDFDocument | null = null;
  private originalSplitPositions: Set<number> = new Set();
  private originalSelectedPages: number[] = [];
  private hasExecuted: boolean = false;
  private pageIdsToDelete: string[] = [];

  constructor(
    private pagesToDelete: number[],
    private getCurrentDocument: () => PDFDocument | null,
    private setDocument: (doc: PDFDocument) => void,
    private setSelectedPages: (pages: number[]) => void,
    private getSplitPositions: () => Set<number>,
    private setSplitPositions: (positions: Set<number>) => void,
    private getSelectedPages: () => number[]
  ) {
    super();
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

    // Filter out deleted pages by ID (stable across undo/redo)
    const remainingPages = currentDoc.pages.filter(page => 
      !this.pageIdsToDelete.includes(page.id)
    );

    if (remainingPages.length === 0) return; // Safety check

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
    const newPositions = new Set<number>();
    currentSplitPositions.forEach(pos => {
      if (pos < remainingPages.length - 1) {
        newPositions.add(pos);
      }
    });

    // Apply changes
    this.setDocument(updatedDocument);
    this.setSelectedPages([]);
    this.setSplitPositions(newPositions);
  }

  undo(): void {
    if (!this.originalDocument) return;

    // Simply restore the complete original document state
    this.setDocument(this.originalDocument);
    this.setSplitPositions(this.originalSplitPositions);
    this.setSelectedPages(this.originalSelectedPages);
  }

  get description(): string {
    return `Delete ${this.pagesToDelete.length} page(s)`;
  }
}

class ReorderPagesCommand extends DOMCommand {
  private originalPages: PDFPage[] = [];

  constructor(
    private sourcePageNumber: number,
    private targetIndex: number,
    private selectedPages: number[] | undefined,
    private getCurrentDocument: () => PDFDocument | null,
    private setDocument: (doc: PDFDocument) => void
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
      newPages.splice(this.targetIndex, 0, movedPage);
      
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

class SplitCommand extends DOMCommand {
  private originalSplitPositions: Set<number> = new Set();

  constructor(
    private position: number,
    private getSplitPositions: () => Set<number>,
    private setSplitPositions: (positions: Set<number>) => void
  ) {
    super();
  }

  execute(): void {
    // Store original state for undo
    this.originalSplitPositions = new Set(this.getSplitPositions());

    // Toggle the split position
    const currentPositions = this.getSplitPositions();
    const newPositions = new Set(currentPositions);
    
    if (newPositions.has(this.position)) {
      newPositions.delete(this.position);
    } else {
      newPositions.add(this.position);
    }
    
    this.setSplitPositions(newPositions);
  }

  undo(): void {
    // Restore original split positions
    this.setSplitPositions(this.originalSplitPositions);
  }

  get description(): string {
    const currentPositions = this.getSplitPositions();
    const willAdd = !currentPositions.has(this.position);
    return `${willAdd ? 'Add' : 'Remove'} split at position ${this.position + 1}`;
  }
}

class BulkRotateCommand extends DOMCommand {
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

class BulkSplitCommand extends DOMCommand {
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

// Simple undo manager for DOM commands
class UndoManager {
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

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onStateChange?.();
  }
}

export interface PageEditorProps {
  onFunctionsReady?: (functions: {
    handleUndo: () => void;
    handleRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    handleRotate: (direction: 'left' | 'right') => void;
    handleDelete: () => void;
    handleSplit: () => void;
    handleSplitAll: () => void;
    showExportPreview: (selectedOnly: boolean) => void;
    onExportSelected: () => void;
    onExportAll: () => void;
    applyChanges: () => void;
    exportLoading: boolean;
    selectionMode: boolean;
    selectedPages: number[];
    splitPositions: Set<number>;
    totalPages: number;
    closePdf: () => void;
  }) => void;
}

const PageEditor = ({
  onFunctionsReady,
}: PageEditorProps) => {
  const { t } = useTranslation();

  // Use split contexts to prevent re-renders
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();
  
  // Prefer IDs + selectors to avoid array identity churn
  const activeFileIds = state.files.ids;
  const primaryFileId = activeFileIds[0] ?? null;
  const selectedFiles = selectors.getSelectedFiles();
  
  // Stable signature for effects (prevents loops)
  const filesSignature = selectors.getFilesSignature();
  
  // UI state
  const globalProcessing = state.ui.isProcessing;
  const processingProgress = state.ui.processingProgress;
  const hasUnsavedChanges = state.ui.hasUnsavedChanges;

  // Edit state management
  const [editedDocument, setEditedDocument] = useState<PDFDocument | null>(null);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [foundDraft, setFoundDraft] = useState<any>(null);
  const autoSaveTimer = useRef<number | null>(null);

  // DOM-first undo manager (replaces the old React state undo system)
  const undoManagerRef = useRef(new UndoManager());

  // Thumbnail generation is now handled on-demand by individual PageThumbnail components using modern services


  // Get primary file record outside useMemo to track processedFile changes
  const primaryFileRecord = primaryFileId ? selectors.getFileRecord(primaryFileId) : null;
  const processedFilePages = primaryFileRecord?.processedFile?.pages;
  const processedFileTotalPages = primaryFileRecord?.processedFile?.totalPages;

  // Compute merged document with stable signature (prevents infinite loops)
  const mergedPdfDocument = useMemo((): PDFDocument | null => {
    if (activeFileIds.length === 0) return null;

    const primaryFile = primaryFileId ? selectors.getFile(primaryFileId) : null;
    
    // If we have file IDs but no file record, something is wrong - return null to show loading
    if (!primaryFileRecord) {
      console.log('🎬 PageEditor: No primary file record found, showing loading');
      return null;
    }

    const name =
      activeFileIds.length === 1
        ? (primaryFileRecord.name ?? 'document.pdf')
        : activeFileIds
            .map(id => (selectors.getFileRecord(id)?.name ?? 'file').replace(/\.pdf$/i, ''))
            .join(' + ');

    // Debug logging for merged document creation
    console.log(`🎬 PageEditor: Building merged document for ${name} with ${activeFileIds.length} files`);
    
    // Collect pages from ALL active files, not just the primary file
    let pages: PDFPage[] = [];
    let totalPageCount = 0;
    
    activeFileIds.forEach((fileId, fileIndex) => {
      const fileRecord = selectors.getFileRecord(fileId);
      if (!fileRecord) {
        console.warn(`🎬 PageEditor: No record found for file ${fileId}`);
        return;
      }
      
      const processedFile = fileRecord.processedFile;
      console.log(`🎬 PageEditor: Processing file ${fileIndex + 1}/${activeFileIds.length} (${fileRecord.name})`);
      console.log(`🎬 ProcessedFile exists:`, !!processedFile);
      console.log(`🎬 ProcessedFile pages:`, processedFile?.pages?.length || 0);
      console.log(`🎬 ProcessedFile totalPages:`, processedFile?.totalPages || 'unknown');
      
      let filePages: PDFPage[] = [];
      
      if (processedFile?.pages && processedFile.pages.length > 0) {
        // Use fully processed pages with thumbnails
        filePages = processedFile.pages.map((page, pageIndex) => ({
          id: `${fileId}-${page.pageNumber}`,
          pageNumber: totalPageCount + pageIndex + 1,
          thumbnail: page.thumbnail || null,
          rotation: page.rotation || 0,
          selected: false,
          splitAfter: page.splitAfter || false,
          originalPageNumber: page.originalPageNumber || page.pageNumber || pageIndex + 1,
          originalFileId: fileId,
        }));
      } else if (processedFile?.totalPages) {
        // Fallback: create pages without thumbnails but with correct count
        console.log(`🎬 PageEditor: Creating placeholder pages for ${fileRecord.name} (${processedFile.totalPages} pages)`);
        filePages = Array.from({ length: processedFile.totalPages }, (_, pageIndex) => ({
          id: `${fileId}-${pageIndex + 1}`,
          pageNumber: totalPageCount + pageIndex + 1,
          originalPageNumber: pageIndex + 1,
          originalFileId: fileId,
          rotation: 0,
          thumbnail: null, // Will be generated later
          selected: false,
          splitAfter: false,
        }));
      }
      
      pages = pages.concat(filePages);
      totalPageCount += filePages.length;
    });

    if (pages.length === 0) {
      console.warn('🎬 PageEditor: No pages found in any files');
      return null;
    }

    console.log(`🎬 PageEditor: Created merged document with ${pages.length} total pages`);

    const mergedDoc: PDFDocument = {
      id: activeFileIds.join('-'),
      name,
      file: primaryFile!,
      pages,
      totalPages: pages.length,
    };

    return mergedDoc;
  }, [activeFileIds, primaryFileId, primaryFileRecord, processedFilePages, processedFileTotalPages, selectors, filesSignature]);

  // Large document detection for smart loading
  const isVeryLargeDocument = useMemo(() => {
    return mergedPdfDocument ? mergedPdfDocument.totalPages > 2000 : false;
  }, [mergedPdfDocument?.totalPages]);

  // Thumbnails are now generated on-demand by PageThumbnail components
  // No bulk generation needed - modern thumbnail service handles this efficiently

  // Selection and UI state management
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<number[]>([]);
  const [movingPage, setMovingPage] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Position-based split tracking (replaces page-based splitAfter)
  const [splitPositions, setSplitPositions] = useState<Set<number>>(new Set());
  
  // Grid container ref for positioning split indicators
  const gridContainerRef = useRef<HTMLDivElement>(null);
  
  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  
  // Undo/Redo state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  // Update undo/redo state
  const updateUndoRedoState = useCallback(() => {
    setCanUndo(undoManagerRef.current.canUndo());
    setCanRedo(undoManagerRef.current.canRedo());
  }, []);
  
  // Set up undo manager callback
  useEffect(() => {
    undoManagerRef.current.setStateChangeCallback(updateUndoRedoState);
    // Initialize state
    updateUndoRedoState();
  }, [updateUndoRedoState]);


  // DOM-first command handlers
  const handleRotatePages = useCallback((pageIds: string[], rotation: number) => {
    const bulkRotateCommand = new BulkRotateCommand(pageIds, rotation);
    undoManagerRef.current.executeCommand(bulkRotateCommand);
  }, []);

  // Page selection handlers
  const togglePage = useCallback((pageNumber: number) => {
    setSelectedPageNumbers(prev => 
      prev.includes(pageNumber)
        ? prev.filter(n => n !== pageNumber)
        : [...prev, pageNumber]
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!mergedPdfDocument) return;
    
    const allPageNumbers = mergedPdfDocument.pages.map(p => p.pageNumber);
    setSelectedPageNumbers(prev => 
      prev.length === allPageNumbers.length ? [] : allPageNumbers
    );
  }, [mergedPdfDocument]);


  // Animation helpers
  const animateReorder = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
  }, []);

  // Placeholder command classes for PageThumbnail compatibility
  class RotatePagesCommand {
    constructor(public pageIds: string[], public rotation: number) {}
    execute() {
      const bulkRotateCommand = new BulkRotateCommand(this.pageIds, this.rotation);
      undoManagerRef.current.executeCommand(bulkRotateCommand);
    }
  }

  class DeletePagesWrapper {
    constructor(public pageIds: string[]) {}
    execute() {
      // Convert page IDs to page numbers for the real delete command
      if (!displayDocument) return;
      
      const pagesToDelete = this.pageIds.map(pageId => {
        const page = displayDocument.pages.find(p => p.id === pageId);
        return page?.pageNumber || 0;
      }).filter(num => num > 0);
      
      if (pagesToDelete.length > 0) {
        const deleteCommand = new DeletePagesCommand(
          pagesToDelete,
          () => displayDocument,
          setEditedDocument,
          setSelectedPageNumbers,
          () => splitPositions,
          setSplitPositions,
          () => selectedPageNumbers
        );
        undoManagerRef.current.executeCommand(deleteCommand);
      }
    }
  }

  class ToggleSplitCommand {
    constructor(public position: number) {}
    execute() {
      const splitCommand = new SplitCommand(
        this.position,
        () => splitPositions,
        setSplitPositions
      );
      undoManagerRef.current.executeCommand(splitCommand);
    }
  }

  // Command executor for PageThumbnail
  const executeCommand = useCallback((command: any) => {
    if (command && typeof command.execute === 'function') {
      command.execute();
    }
  }, []);

  // Interface functions for parent component
  const displayDocument = editedDocument || mergedPdfDocument;
  
  
  const handleUndo = useCallback(() => {
    undoManagerRef.current.undo();
  }, []);

  const handleRedo = useCallback(() => {
    undoManagerRef.current.redo();
  }, []);

  const handleRotate = useCallback((direction: 'left' | 'right') => {
    if (!displayDocument) return;
    const rotation = direction === 'left' ? -90 : 90;
    const pagesToRotate = selectionMode && selectedPageNumbers.length > 0
      ? selectedPageNumbers.map(pageNum => {
          const page = displayDocument.pages.find(p => p.pageNumber === pageNum);
          return page?.id || '';
        }).filter(id => id)
      : displayDocument.pages.map(p => p.id);
    
    handleRotatePages(pagesToRotate, rotation);
  }, [displayDocument, selectedPageNumbers, selectionMode, handleRotatePages]);

  const handleDelete = useCallback(() => {
    if (!displayDocument || selectedPageNumbers.length === 0) return;
    
    const deleteCommand = new DeletePagesCommand(
      selectedPageNumbers,
      () => displayDocument,
      setEditedDocument,
      setSelectedPageNumbers,
      () => splitPositions,
      setSplitPositions,
      () => selectedPageNumbers
    );
    undoManagerRef.current.executeCommand(deleteCommand);
  }, [selectedPageNumbers, displayDocument, splitPositions]);

  const handleDeletePage = useCallback((pageNumber: number) => {
    if (!displayDocument) return;
    
    const deleteCommand = new DeletePagesCommand(
      [pageNumber],
      () => displayDocument,
      setEditedDocument,
      setSelectedPageNumbers,
      () => splitPositions,
      setSplitPositions,
      () => selectedPageNumbers
    );
    undoManagerRef.current.executeCommand(deleteCommand);
  }, [displayDocument, splitPositions, selectedPageNumbers]);

  const handleSplit = useCallback(() => {
    if (!displayDocument || selectedPageNumbers.length === 0) return;
    
    console.log('Toggle split markers at selected page positions:', selectedPageNumbers);
    
    // Convert page numbers to positions (0-based indices)
    const positions: number[] = [];
    selectedPageNumbers.forEach(pageNum => {
      const pageIndex = displayDocument.pages.findIndex(p => p.pageNumber === pageNum);
      if (pageIndex !== -1 && pageIndex < displayDocument.pages.length - 1) {
        // Only allow splits before the last page
        positions.push(pageIndex);
      }
    });

    if (positions.length > 0) {
      const bulkSplitCommand = new BulkSplitCommand(
        positions,
        () => splitPositions,
        setSplitPositions
      );
      undoManagerRef.current.executeCommand(bulkSplitCommand);
    }
  }, [selectedPageNumbers, displayDocument, splitPositions]);

  const handleSplitAll = useCallback(() => {
    if (!displayDocument) return;
    
    // Create a command that toggles all splits
    class SplitAllCommand extends DOMCommand {
      private originalSplitPositions: Set<number> = new Set();
      private allPossibleSplits: Set<number> = new Set();
      
      constructor() {
        super();
        // Calculate all possible split positions
        for (let i = 0; i < displayDocument!.pages.length - 1; i++) {
          this.allPossibleSplits.add(i);
        }
      }
      
      execute(): void {
        // Store original state for undo
        this.originalSplitPositions = new Set(splitPositions);
        
        // Check if all splits are already active
        const hasAllSplits = Array.from(this.allPossibleSplits).every(pos => splitPositions.has(pos));
        
        if (hasAllSplits) {
          // Remove all splits
          setSplitPositions(new Set());
        } else {
          // Add all splits
          setSplitPositions(this.allPossibleSplits);
        }
      }
      
      undo(): void {
        // Restore original split positions
        setSplitPositions(this.originalSplitPositions);
      }
      
      get description(): string {
        const hasAllSplits = Array.from(this.allPossibleSplits).every(pos => splitPositions.has(pos));
        return hasAllSplits ? 'Remove all splits' : 'Split all pages';
      }
    }
    
    const splitAllCommand = new SplitAllCommand();
    undoManagerRef.current.executeCommand(splitAllCommand);
  }, [displayDocument, splitPositions]);

  const handleReorderPages = useCallback((sourcePageNumber: number, targetIndex: number, selectedPages?: number[]) => {
    if (!displayDocument) return;
    
    const reorderCommand = new ReorderPagesCommand(
      sourcePageNumber,
      targetIndex,
      selectedPages,
      () => displayDocument,
      setEditedDocument
    );
    undoManagerRef.current.executeCommand(reorderCommand);
  }, [displayDocument]);



  const onExportSelected = useCallback(async () => {
    if (!displayDocument || selectedPageNumbers.length === 0) return;
    
    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      console.log('Applying DOM changes before export...');
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument, // Original order
        displayDocument, // Current display order (includes reordering)
        splitPositions // Position-based splits
      );
      
      // For selected pages export, we work with the first document (or single document)
      const documentWithDOMState = Array.isArray(processedDocuments) ? processedDocuments[0] : processedDocuments;
      
      // Step 2: Convert selected page numbers to page IDs from the document with DOM state
      const selectedPageIds = selectedPageNumbers.map(pageNum => {
        const page = documentWithDOMState.pages.find(p => p.pageNumber === pageNum);
        return page?.id || '';
      }).filter(id => id);

      // Step 3: Export with pdfExportService
      console.log('Exporting selected pages:', selectedPageNumbers, 'with DOM rotations applied');
      const result = await pdfExportService.exportPDF(
        documentWithDOMState,
        selectedPageIds,
        { selectedOnly: true, filename: documentWithDOMState.name }
      );

      // Step 4: Download the result
      pdfExportService.downloadFile(result.blob, result.filename);
      
      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, selectedPageNumbers, mergedPdfDocument, splitPositions]);

  const onExportAll = useCallback(async () => {
    if (!displayDocument) return;
    
    setExportLoading(true);
    try {
      // Step 1: Apply DOM changes to document state first
      console.log('Applying DOM changes before export...');
      const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
        mergedPdfDocument || displayDocument, // Original order
        displayDocument, // Current display order (includes reordering)
        splitPositions // Position-based splits
      );
      
      // Step 2: Check if we have multiple documents (splits) or single document
      if (Array.isArray(processedDocuments)) {
        // Multiple documents (splits) - export as ZIP
        console.log('Exporting multiple split documents:', processedDocuments.length);
        const blobs: Blob[] = [];
        const filenames: string[] = [];
        
        for (const doc of processedDocuments) {
          const result = await pdfExportService.exportPDF(doc, [], { filename: doc.name });
          blobs.push(result.blob);
          filenames.push(result.filename);
        }
        
        // Create ZIP file
        const JSZip = await import('jszip');
        const zip = new JSZip.default();
        
        blobs.forEach((blob, index) => {
          zip.file(filenames[index], blob);
        });
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFilename = displayDocument.name.replace(/\.pdf$/i, '.zip');
        
        pdfExportService.downloadFile(zipBlob, zipFilename);
      } else {
        // Single document - regular export
        console.log('Exporting as single PDF');
        const result = await pdfExportService.exportPDF(
          processedDocuments,
          [],
          { selectedOnly: false, filename: processedDocuments.name }
        );

        pdfExportService.downloadFile(result.blob, result.filename);
      }
      
      setExportLoading(false);
    } catch (error) {
      console.error('Export failed:', error);
      setExportLoading(false);
    }
  }, [displayDocument, mergedPdfDocument, splitPositions]);

  // Apply DOM changes to document state using dedicated service
  const applyChanges = useCallback(() => {
    if (!displayDocument) return;
    
    // Pass current display document (which includes reordering) to get both reordering AND DOM changes
    const processedDocuments = documentManipulationService.applyDOMChangesToDocument(
      mergedPdfDocument || displayDocument, // Original order
      displayDocument, // Current display order (includes reordering)
      splitPositions // Position-based splits
    );
    
    // For apply changes, we only set the first document if it's an array (splits shouldn't affect document state)
    const documentToSet = Array.isArray(processedDocuments) ? processedDocuments[0] : processedDocuments;
    setEditedDocument(documentToSet);
    
    console.log('Changes applied to document');
  }, [displayDocument, mergedPdfDocument, splitPositions]);


  const closePdf = useCallback(() => {
    actions.clearAllFiles();
    undoManagerRef.current.clear();
    setSelectedPageNumbers([]);
    setSelectionMode(false);
  }, [actions]);

  // Export preview function - defined after export functions to avoid circular dependency  
  const handleExportPreview = useCallback((selectedOnly: boolean = false) => {
    if (!displayDocument) return;
    
    // For now, trigger the actual export directly
    // In the original, this would show a preview modal first
    if (selectedOnly) {
      onExportSelected();
    } else {
      onExportAll();
    }
  }, [displayDocument, onExportSelected, onExportAll]);

  // Expose functions to parent component
  useEffect(() => {
    if (onFunctionsReady) {
      onFunctionsReady({
        handleUndo,
        handleRedo,
        canUndo,
        canRedo,
        handleRotate,
        handleDelete,
        handleSplit,
        handleSplitAll,
        showExportPreview: handleExportPreview,
        onExportSelected,
        onExportAll,
        applyChanges,
        exportLoading,
        selectionMode,
        selectedPages: selectedPageNumbers,
        splitPositions,
        totalPages: displayDocument?.pages.length || 0,
        closePdf,
      });
    }
  }, [
    onFunctionsReady, handleUndo, handleRedo, canUndo, canRedo, handleRotate, handleDelete, handleSplit, handleSplitAll,
    handleExportPreview, onExportSelected, onExportAll, applyChanges, exportLoading, selectionMode, selectedPageNumbers, 
    splitPositions, displayDocument?.pages.length, closePdf
  ]);

  // Display all pages - use edited or original document
  const displayedPages = displayDocument?.pages || [];

  return (
    <Box pos="relative" h="100vh" pt={40} style={{ overflow: 'auto' }} data-scrolling-container="true">
      <LoadingOverlay visible={globalProcessing && !mergedPdfDocument} />

      {!mergedPdfDocument && !globalProcessing && activeFileIds.length === 0 && (
        <Center h="100vh">
          <Stack align="center" gap="md">
            <Text size="lg" c="dimmed">📄</Text>
            <Text c="dimmed">No PDF files loaded</Text>
            <Text size="sm" c="dimmed">Add files to start editing pages</Text>
          </Stack>
        </Center>
      )}

      {!mergedPdfDocument && globalProcessing && (
        <Box p={0}>
          <SkeletonLoader type="controls" />
          <SkeletonLoader type="pageGrid" count={8} />
        </Box>
      )}

      {displayDocument && (
        <Box ref={gridContainerRef} p={0} style={{ position: 'relative' }}>
          {/* File name and basic controls */}
          <Group mb="md" p="md" justify="space-between">
            <TextInput
              placeholder="Enter filename"
              defaultValue={displayDocument.name.replace(/\.pdf$/i, '')}
              style={{ minWidth: 300 }}
            />
            <Group>
              <Button 
                variant={selectionMode ? "filled" : "outline"} 
                onClick={() => setSelectionMode(!selectionMode)}
              >
                {selectionMode ? "Exit Selection" : "Select Pages"}
              </Button>
              {selectionMode && (
                <>
                  <Button variant="outline" onClick={toggleSelectAll}>
                    {selectedPageNumbers.length === displayDocument.pages.length ? "Deselect All" : "Select All"}
                  </Button>
                  <Text size="sm" c="dimmed">
                    {selectedPageNumbers.length} selected
                  </Text>
                </>
              )}
            </Group>
          </Group>


          {/* Split Lines Overlay */}
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 10
            }}
          >
            {Array.from(splitPositions).map((position) => {
              // Calculate the split line position based on grid layout
              const ITEM_WIDTH = 320; // 20rem
              const ITEM_HEIGHT = 340; // 20rem + gap
              const ITEM_GAP = 24; // 1.5rem
              const ITEMS_PER_ROW = 4; // Default, could be dynamic
              
              const row = Math.floor(position / ITEMS_PER_ROW);
              const col = position % ITEMS_PER_ROW;
              
              // Position after the current item
              const leftPosition = (col + 1) * (ITEM_WIDTH + ITEM_GAP) - ITEM_GAP / 2;
              const topPosition = row * ITEM_HEIGHT + 100; // Offset for header controls
              
              return (
                <div
                  key={`split-${position}`}
                  style={{
                    position: 'absolute',
                    left: leftPosition,
                    top: topPosition,
                    width: '1px',
                    height: '20rem', // Match item height
                    borderLeft: '1px dashed #3b82f6'
                  }}
                />
              );
            })}
          </div>

          {/* Pages Grid */}
          <DragDropGrid
            items={displayedPages}
            selectedItems={selectedPageNumbers}
            selectionMode={selectionMode}
            isAnimating={isAnimating}
            onReorderPages={handleReorderPages}
            renderItem={(page, index, refs) => (
              <PageThumbnail
                key={page.id}
                page={page}
                index={index}
                totalPages={displayDocument.pages.length}
                originalFile={activeFileIds.length === 1 && primaryFileId ? selectors.getFile(primaryFileId) : undefined}
                selectedPages={selectedPageNumbers}
                selectionMode={selectionMode}
                movingPage={movingPage}
                isAnimating={isAnimating}
                pageRefs={refs}
                onReorderPages={handleReorderPages}
                onTogglePage={togglePage}
                onAnimateReorder={animateReorder}
                onExecuteCommand={executeCommand}
                onSetStatus={() => {}}
                onSetMovingPage={setMovingPage}
                onDeletePage={handleDeletePage}
                RotatePagesCommand={RotatePagesCommand}
                DeletePagesCommand={DeletePagesWrapper}
                ToggleSplitCommand={ToggleSplitCommand}
                pdfDocument={displayDocument}
                setPdfDocument={setEditedDocument}
                splitPositions={splitPositions}
              />
            )}
          />

        </Box>
      )}


      <NavigationWarningModal />
    </Box>
  );
};

export default PageEditor;