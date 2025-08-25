import { PDFDocument, PDFPage } from '../types/pageEditor';

/**
 * Service for applying DOM changes to PDF document state
 * Reads current DOM state and updates the document accordingly
 */
export class DocumentManipulationService {
  /**
   * Apply all DOM changes (rotations, splits, reordering) to document state
   * Returns single document or multiple documents if splits are present
   */
  applyDOMChangesToDocument(pdfDocument: PDFDocument, currentDisplayOrder?: PDFDocument, splitPositions?: Set<number>): PDFDocument | PDFDocument[] {
    console.log('DocumentManipulationService: Applying DOM changes to document');
    console.log('Original document page order:', pdfDocument.pages.map(p => p.pageNumber));
    console.log('Current display order:', currentDisplayOrder?.pages.map(p => p.pageNumber) || 'none provided');
    console.log('Split positions:', splitPositions ? Array.from(splitPositions).sort() : 'none');
    
    // Use current display order (from React state) if provided, otherwise use original order
    const baseDocument = currentDisplayOrder || pdfDocument;
    console.log('Using page order:', baseDocument.pages.map(p => p.pageNumber));
    
    // Apply DOM changes to each page (rotation only now, splits are position-based)
    let updatedPages = baseDocument.pages.map(page => this.applyPageChanges(page));
    
    // Convert position-based splits to page-based splits for export
    if (splitPositions && splitPositions.size > 0) {
      updatedPages = updatedPages.map((page, index) => ({
        ...page,
        splitAfter: splitPositions.has(index)
      }));
    }
    
    // Create final document with reordered pages and applied changes
    const finalDocument = {
      ...pdfDocument, // Use original document metadata but updated pages
      pages: updatedPages // Use reordered pages with applied changes
    };

    // Check for splits and return multiple documents if needed
    if (splitPositions && splitPositions.size > 0) {
      return this.createSplitDocuments(finalDocument);
    }
    
    return finalDocument;
  }

  /**
   * Check if document has split markers
   */
  private hasSplitMarkers(document: PDFDocument): boolean {
    return document.pages.some(page => page.splitAfter);
  }

  /**
   * Create multiple documents from split markers
   */
  private createSplitDocuments(document: PDFDocument): PDFDocument[] {
    const documents: PDFDocument[] = [];
    const splitPoints: number[] = [];
    
    // Find split points - pages with splitAfter create split points AFTER them
    document.pages.forEach((page, index) => {
      if (page.splitAfter) {
        splitPoints.push(index + 1);
      }
    });
    
    // Add end point if not already there
    if (splitPoints.length === 0 || splitPoints[splitPoints.length - 1] !== document.pages.length) {
      splitPoints.push(document.pages.length);
    }
    
    let startIndex = 0;
    let partNumber = 1;
    
    for (const endIndex of splitPoints) {
      const segmentPages = document.pages.slice(startIndex, endIndex);
      
      if (segmentPages.length > 0) {
        documents.push({
          ...document,
          id: `${document.id}_part_${partNumber}`,
          name: `${document.name.replace(/\.pdf$/i, '')}_part_${partNumber}.pdf`,
          pages: segmentPages,
          totalPages: segmentPages.length
        });
        partNumber++;
      }
      
      startIndex = endIndex;
    }
    
    console.log(`Created ${documents.length} split documents`);
    return documents;
  }

  /**
   * Apply DOM changes for a single page
   */
  private applyPageChanges(page: PDFPage): PDFPage {
    // Find the DOM element for this page
    const pageElement = document.querySelector(`[data-page-id="${page.id}"]`);
    if (!pageElement) {
      console.log(`Page ${page.pageNumber}: No DOM element found, keeping original state`);
      return page;
    }

    const updatedPage = { ...page };

    // Apply rotation changes from DOM
    updatedPage.rotation = this.getRotationFromDOM(pageElement, page);
    
    // Apply split marker changes from document state (already handled by commands)
    // Split markers are already updated by ToggleSplitCommand, so no DOM reading needed
    
    return updatedPage;
  }

  /**
   * Read rotation from DOM element
   */
  private getRotationFromDOM(pageElement: Element, originalPage: PDFPage): number {
    const img = pageElement.querySelector('img');
    if (img && img.style.transform) {
      // Parse rotation from transform property (e.g., "rotate(90deg)" -> 90)
      const rotationMatch = img.style.transform.match(/rotate\((-?\d+)deg\)/);
      const domRotation = rotationMatch ? parseInt(rotationMatch[1]) : 0;
      
      console.log(`Page ${originalPage.pageNumber}: DOM rotation = ${domRotation}°, original = ${originalPage.rotation}°`);
      return domRotation;
    }
    
    console.log(`Page ${originalPage.pageNumber}: No DOM rotation found, keeping original = ${originalPage.rotation}°`);
    return originalPage.rotation;
  }

  /**
   * Reset all DOM changes (useful for "discard changes" functionality)
   */
  resetDOMToDocumentState(pdfDocument: PDFDocument): void {
    console.log('DocumentManipulationService: Resetting DOM to match document state');
    
    pdfDocument.pages.forEach(page => {
      const pageElement = document.querySelector(`[data-page-id="${page.id}"]`);
      if (pageElement) {
        const img = pageElement.querySelector('img');
        if (img) {
          // Reset rotation to match document state
          img.style.transform = `rotate(${page.rotation}deg)`;
        }
      }
    });
  }

  /**
   * Check if DOM state differs from document state
   */
  hasUnsavedChanges(pdfDocument: PDFDocument): boolean {
    return pdfDocument.pages.some(page => {
      const pageElement = document.querySelector(`[data-page-id="${page.id}"]`);
      if (pageElement) {
        const domRotation = this.getRotationFromDOM(pageElement, page);
        return domRotation !== page.rotation;
      }
      return false;
    });
  }
}

// Export singleton instance
export const documentManipulationService = new DocumentManipulationService();