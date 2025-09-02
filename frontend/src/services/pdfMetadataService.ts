/**
 * PDF Metadata Service - File History Tracking with pdf-lib
 * 
 * Handles injection and extraction of file history metadata in PDFs using pdf-lib.
 * This service embeds file history directly into PDF metadata, making it persistent
 * across all tool operations and downloads.
 */

import { PDFDocument } from 'pdf-lib';
import { FileId } from '../types/file';
import { ContentCache, type CacheConfig } from '../utils/ContentCache';

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Tool operation metadata for history tracking
 */
export interface ToolOperation {
  toolName: string;
  timestamp: number;
  parameters?: Record<string, any>;
}

/**
 * Complete file history metadata structure
 */
export interface PDFHistoryMetadata {
  stirlingHistory: {
    originalFileId: string;
    parentFileId?: string;
    versionNumber: number;
    toolChain: ToolOperation[];
    createdBy: 'Stirling-PDF';
    formatVersion: '1.0';
    createdAt: number;
    lastModified: number;
  };
}

/**
 * Service for managing PDF file history metadata
 */
export class PDFMetadataService {
  private static readonly HISTORY_KEYWORD = 'stirling-history';
  private static readonly FORMAT_VERSION = '1.0';
  
  private metadataCache: ContentCache<PDFHistoryMetadata | null>;
  
  constructor(cacheConfig?: Partial<CacheConfig>) {
    const defaultConfig: CacheConfig = {
      ttl: 5 * 60 * 1000, // 5 minutes
      maxSize: 100, // 100 files
      enableWarnings: DEBUG
    };
    
    this.metadataCache = new ContentCache<PDFHistoryMetadata | null>({
      ...defaultConfig,
      ...cacheConfig
    });
  }

  /**
   * Inject file history metadata into a PDF
   */
  async injectHistoryMetadata(
    pdfBytes: ArrayBuffer,
    originalFileId: string,
    parentFileId?: string,
    toolChain: ToolOperation[] = [],
    versionNumber: number = 1
  ): Promise<ArrayBuffer> {
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      
      const historyMetadata: PDFHistoryMetadata = {
        stirlingHistory: {
          originalFileId,
          parentFileId,
          versionNumber,
          toolChain: [...toolChain],
          createdBy: 'Stirling-PDF',
          formatVersion: PDFMetadataService.FORMAT_VERSION,
          createdAt: Date.now(),
          lastModified: Date.now()
        }
      };

      // Set basic metadata
      pdfDoc.setCreator('Stirling-PDF');
      pdfDoc.setProducer('Stirling-PDF');
      pdfDoc.setModificationDate(new Date());

      // Embed history metadata in keywords field (most compatible)
      const historyJson = JSON.stringify(historyMetadata);
      const existingKeywords = pdfDoc.getKeywords();
      
      // Handle keywords as array (pdf-lib stores them as array)
      let keywordList: string[] = [];
      if (Array.isArray(existingKeywords)) {
        // Remove any existing history keywords to avoid duplicates
        keywordList = existingKeywords.filter(keyword => 
          !keyword.startsWith(`${PDFMetadataService.HISTORY_KEYWORD}:`)
        );
      } else if (existingKeywords) {
        // Remove history from single keyword string
        const cleanKeyword = this.extractHistoryFromKeywords(existingKeywords, true);
        if (cleanKeyword) {
          keywordList = [cleanKeyword];
        }
      }
      
      // Add our new history metadata as a keyword (replacing any previous history)
      const historyKeyword = `${PDFMetadataService.HISTORY_KEYWORD}:${historyJson}`;
      keywordList.push(historyKeyword);
      
      pdfDoc.setKeywords(keywordList);

      if (DEBUG) {
        console.log('📄 Injected PDF history metadata:', {
          originalFileId,
          parentFileId,
          versionNumber,
          toolCount: toolChain.length
        });
      }

      return await pdfDoc.save();
    } catch (error) {
      if (DEBUG) console.error('📄 Failed to inject PDF metadata:', error);
      // Return original bytes if metadata injection fails
      return pdfBytes;
    }
  }

  /**
   * Extract file history metadata from a PDF
   */
  async extractHistoryMetadata(pdfBytes: ArrayBuffer): Promise<PDFHistoryMetadata | null> {
    const cacheKey = this.metadataCache.generateKeyFromBuffer(pdfBytes);
    
    // Check cache first
    const cached = this.metadataCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }
    
    // Extract from PDF
    const metadata = await this.extractHistoryMetadataInternal(pdfBytes);
    
    // Cache the result
    this.metadataCache.set(cacheKey, metadata);
    
    return metadata;
  }

  /**
   * Internal method for actual PDF metadata extraction
   */
  private async extractHistoryMetadataInternal(pdfBytes: ArrayBuffer): Promise<PDFHistoryMetadata | null> {
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const keywords = pdfDoc.getKeywords();
      
      // Look for history keyword directly in array or convert to string
      let historyJson: string | null = null;
      
      if (Array.isArray(keywords)) {
        // Search through keywords array for our history keyword - get the LATEST one
        const historyKeywords = keywords.filter(keyword => 
          keyword.startsWith(`${PDFMetadataService.HISTORY_KEYWORD}:`)
        );
        
        if (historyKeywords.length > 0) {
          // If multiple history keywords exist, parse all and get the highest version number
          let latestVersionNumber = 0;
          
          for (const historyKeyword of historyKeywords) {
            try {
              const json = historyKeyword.substring(`${PDFMetadataService.HISTORY_KEYWORD}:`.length);
              const parsed = JSON.parse(json) as PDFHistoryMetadata;
              
              if (parsed.stirlingHistory.versionNumber > latestVersionNumber) {
                latestVersionNumber = parsed.stirlingHistory.versionNumber;
                historyJson = json;
              }
            } catch (error) {
              // Silent fallback for corrupted history
            }
          }
        }
      } else if (keywords) {
        // Fallback to string parsing
        historyJson = this.extractHistoryFromKeywords(keywords);
      }
      
      if (!historyJson) return null;

      const metadata = JSON.parse(historyJson) as PDFHistoryMetadata;
      
      // Validate metadata structure
      if (!this.isValidHistoryMetadata(metadata)) {
        return null;
      }

      return metadata;
    } catch (error) {
      if (DEBUG) console.error('📄 Failed to extract PDF metadata:', error);
      return null;
    }
  }

  /**
   * Add a tool operation to existing PDF history
   */
  async addToolOperation(
    pdfBytes: ArrayBuffer,
    toolOperation: ToolOperation
  ): Promise<ArrayBuffer> {
    try {
      // Extract existing history
      const existingHistory = await this.extractHistoryMetadata(pdfBytes);
      
      if (!existingHistory) {
        if (DEBUG) console.warn('📄 No existing history found, cannot add tool operation');
        return pdfBytes;
      }

      // Add new tool operation
      const updatedToolChain = [...existingHistory.stirlingHistory.toolChain, toolOperation];
      
      // Re-inject with updated history
      return await this.injectHistoryMetadata(
        pdfBytes,
        existingHistory.stirlingHistory.originalFileId,
        existingHistory.stirlingHistory.parentFileId,
        updatedToolChain,
        existingHistory.stirlingHistory.versionNumber
      );
    } catch (error) {
      if (DEBUG) console.error('📄 Failed to add tool operation:', error);
      return pdfBytes;
    }
  }

  /**
   * Create a new version of a PDF with incremented version number
   */
  async createNewVersion(
    pdfBytes: ArrayBuffer,
    parentFileId: string,
    toolOperation: ToolOperation
  ): Promise<ArrayBuffer> {
    try {
      const parentHistory = await this.extractHistoryMetadata(pdfBytes);
      
      const originalFileId = parentHistory?.stirlingHistory.originalFileId || parentFileId;
      const parentToolChain = parentHistory?.stirlingHistory.toolChain || [];
      const newVersionNumber = (parentHistory?.stirlingHistory.versionNumber || 0) + 1;
      
      // Create new tool chain with the new operation
      const newToolChain = [...parentToolChain, toolOperation];

      return await this.injectHistoryMetadata(
        pdfBytes,
        originalFileId,
        parentFileId,
        newToolChain,
        newVersionNumber
      );
    } catch (error) {
      if (DEBUG) console.error('📄 Failed to create new version:', error);
      return pdfBytes;
    }
  }

  /**
   * Check if a PDF has Stirling history metadata
   */
  async hasStirlingHistory(pdfBytes: ArrayBuffer): Promise<boolean> {
    const metadata = await this.extractHistoryMetadata(pdfBytes);
    return metadata !== null;
  }

  /**
   * Get version information from PDF
   */
  async getVersionInfo(pdfBytes: ArrayBuffer): Promise<{
    originalFileId: string;
    versionNumber: number;
    toolCount: number;
    parentFileId?: string;
  } | null> {
    const metadata = await this.extractHistoryMetadata(pdfBytes);
    if (!metadata) return null;

    return {
      originalFileId: metadata.stirlingHistory.originalFileId,
      versionNumber: metadata.stirlingHistory.versionNumber,
      toolCount: metadata.stirlingHistory.toolChain.length,
      parentFileId: metadata.stirlingHistory.parentFileId
    };
  }

  /**
   * Embed history JSON in keywords field with delimiter
   */
  private embedHistoryInKeywords(existingKeywords: string, historyJson: string): string {
    // Remove any existing history
    const cleanKeywords = this.extractHistoryFromKeywords(existingKeywords, true) || existingKeywords;
    
    // Add new history with delimiter
    const historyKeyword = `${PDFMetadataService.HISTORY_KEYWORD}:${historyJson}`;
    
    if (cleanKeywords.trim()) {
      return `${cleanKeywords.trim()} ${historyKeyword}`;
    }
    return historyKeyword;
  }

  /**
   * Extract history JSON from keywords field
   */
  private extractHistoryFromKeywords(keywords: string, returnRemainder = false): string | null {
    const historyPrefix = `${PDFMetadataService.HISTORY_KEYWORD}:`;
    const historyIndex = keywords.indexOf(historyPrefix);
    
    if (historyIndex === -1) return null;

    const historyStart = historyIndex + historyPrefix.length;
    let historyEnd = keywords.length;
    
    // Look for the next keyword (space followed by non-JSON content)
    // Simple heuristic: find space followed by word that doesn't look like JSON
    const afterHistory = keywords.substring(historyStart);
    const nextSpaceIndex = afterHistory.indexOf(' ');
    if (nextSpaceIndex > 0) {
      const afterSpace = afterHistory.substring(nextSpaceIndex + 1);
      if (afterSpace && !afterSpace.trim().startsWith('{')) {
        historyEnd = historyStart + nextSpaceIndex;
      }
    }

    if (returnRemainder) {
      // Return keywords with history removed
      const before = keywords.substring(0, historyIndex);
      const after = keywords.substring(historyEnd);
      return `${before}${after}`.replace(/\s+/g, ' ').trim();
    }

    return keywords.substring(historyStart, historyEnd).trim();
  }

  /**
   * Validate metadata structure
   */
  private isValidHistoryMetadata(metadata: any): metadata is PDFHistoryMetadata {
    return metadata &&
           metadata.stirlingHistory &&
           typeof metadata.stirlingHistory.originalFileId === 'string' &&
           typeof metadata.stirlingHistory.versionNumber === 'number' &&
           Array.isArray(metadata.stirlingHistory.toolChain) &&
           metadata.stirlingHistory.createdBy === 'Stirling-PDF' &&
           metadata.stirlingHistory.formatVersion === PDFMetadataService.FORMAT_VERSION;
  }
}

// Export singleton instance with optimized cache settings
export const pdfMetadataService = new PDFMetadataService({
  ttl: 10 * 60 * 1000, // 10 minutes for PDF metadata (longer than default)
  maxSize: 50, // Smaller cache for memory efficiency  
  enableWarnings: DEBUG
});