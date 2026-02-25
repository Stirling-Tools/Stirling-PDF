import JSZip, { JSZipObject } from 'jszip';
import { StirlingFileStub, createStirlingFile } from '@app/types/fileContext';
import { generateThumbnailForFile } from '@app/utils/thumbnailUtils';
import { fileStorage } from '@app/services/fileStorage';

// Undocumented interface in JSZip for JSZipObject._data
interface CompressedObject {
    compressedSize: number;
    uncompressedSize: number;
    crc32: number;
    compression: object;
    compressedContent: string|ArrayBuffer|Uint8Array|Buffer;
}

const getData = (zipEntry: JSZipObject): CompressedObject | undefined => {
  return (zipEntry as any)._data as CompressedObject;
};

export interface ZipExtractionResult {
  success: boolean;
  extractedFiles: File[];
  errors: string[];
  totalFiles: number;
  extractedCount: number;
}

export interface ZipValidationResult {
  isValid: boolean;
  fileCount: number;
  totalSizeBytes: number;
  containsPDFs: boolean;
  containsFiles: boolean;
  errors: string[];
}

export interface ZipExtractionProgress {
  currentFile: string;
  extractedCount: number;
  totalFiles: number;
  progress: number;
}

export class ZipFileService {
  private readonly maxFileSize = 100 * 1024 * 1024; // 100MB per file
  private readonly maxTotalSize = 500 * 1024 * 1024; // 500MB total extraction limit

  // Warn user when extracting ZIP with more than this many files
  public static readonly ZIP_WARNING_THRESHOLD = 20;

  // ZIP file validation constants
  private static readonly VALID_ZIP_TYPES = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'application/octet-stream' // Some browsers use this for ZIP files
  ];
  private static readonly VALID_ZIP_EXTENSIONS = ['.zip'];

  /**
   * Validate a ZIP file without extracting it
   */
  async validateZipFile(file: File): Promise<ZipValidationResult> {
    const result: ZipValidationResult = {
      isValid: false,
      fileCount: 0,
      totalSizeBytes: 0,
      containsPDFs: false,
      containsFiles: false,
      errors: []
    };

    try {
      // Check file size
      if (file.size > this.maxTotalSize) {
        result.errors.push(`ZIP file too large: ${this.formatFileSize(file.size)} (max: ${this.formatFileSize(this.maxTotalSize)})`);
        return result;
      }

      // Check file type
      if (!this.isZipFile(file)) {
        result.errors.push('File is not a valid ZIP archive');
        return result;
      }

      // Load and validate ZIP contents
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(file);

      let totalSize = 0;
      let fileCount = 0;
      let containsPDFs = false;

      // Analyze ZIP contents
      for (const [filename, zipEntry] of Object.entries(zipContents.files)) {
        if (zipEntry.dir) {
          continue; // Skip directories
        }

        fileCount++;
        const uncompressedSize = getData(zipEntry)?.uncompressedSize || 0;
        totalSize += uncompressedSize;

        // Check if file is a PDF
        if (this.isPdfFile(filename)) {
          containsPDFs = true;
        }

        // Check individual file size
        if (uncompressedSize > this.maxFileSize) {
          result.errors.push(`File "${filename}" too large: ${this.formatFileSize(uncompressedSize)} (max: ${this.formatFileSize(this.maxFileSize)})`);
        }
      }

      // Check total uncompressed size
      if (totalSize > this.maxTotalSize) {
        result.errors.push(`Total uncompressed size too large: ${this.formatFileSize(totalSize)} (max: ${this.formatFileSize(this.maxTotalSize)})`);
      }

      result.fileCount = fileCount;
      result.totalSizeBytes = totalSize;
      result.containsPDFs = containsPDFs;
      result.containsFiles = fileCount > 0;

      // ZIP is valid if it has files and no size errors
      result.isValid = result.errors.length === 0 && result.containsFiles;

      if (!result.containsFiles) {
        result.errors.push('ZIP file does not contain any files');
      }

      return result;
    } catch (error) {
      result.errors.push(`Failed to validate ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Create a ZIP file from an array of files
   */
  async createZipFromFiles(files: File[], zipFilename: string): Promise<{ zipFile: File; size: number }> {
    try {
      const zip = new JSZip();

      // Add each file to the ZIP
      for (const file of files) {
        const content = await file.arrayBuffer();
        zip.file(file.name, content);
      }

      // Generate ZIP blob
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const zipFile = new File([zipBlob], zipFilename, {
        type: 'application/zip',
        lastModified: Date.now()
      });

      return { zipFile, size: zipFile.size };
    } catch (error) {
      throw new Error(
        `Failed to create ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  /**
   * Extract PDF files from a ZIP archive
   */
  async extractPdfFiles(
    file: File,
    onProgress?: (progress: ZipExtractionProgress) => void
  ): Promise<ZipExtractionResult> {
    const result: ZipExtractionResult = {
      success: false,
      extractedFiles: [],
      errors: [],
      totalFiles: 0,
      extractedCount: 0
    };

    try {
      // Validate ZIP file first
      const validation = await this.validateZipFile(file);
      if (!validation.isValid) {
        result.errors = validation.errors;
        return result;
      }

      // Load ZIP contents
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(file);

      // Get all PDF files
      const pdfFiles = Object.entries(zipContents.files).filter(([filename, zipEntry]) =>
        !zipEntry.dir && this.isPdfFile(filename)
      );

      result.totalFiles = pdfFiles.length;

      // Extract each PDF file
      for (let i = 0; i < pdfFiles.length; i++) {
        const [filename, zipEntry] = pdfFiles[i];

        try {
          // Report progress
          if (onProgress) {
            onProgress({
              currentFile: filename,
              extractedCount: i,
              totalFiles: pdfFiles.length,
              progress: (i / pdfFiles.length) * 100
            });
          }

          // Extract file content
          const content = await zipEntry.async('uint8array');

          // Create File object
          const extractedFile = new File([content as any], this.sanitizeFilename(filename), {
            type: 'application/pdf',
            lastModified: zipEntry.date?.getTime() || Date.now()
          });

          // Validate extracted PDF
          if (await this.isValidPdfFile(extractedFile)) {
            result.extractedFiles.push(extractedFile);
            result.extractedCount++;
          } else {
            result.errors.push(`File "${filename}" is not a valid PDF`);
          }
        } catch (error) {
          result.errors.push(`Failed to extract "${filename}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Final progress report
      if (onProgress) {
        onProgress({
          currentFile: '',
          extractedCount: result.extractedCount,
          totalFiles: result.totalFiles,
          progress: 100
        });
      }

      result.success = result.extractedCount > 0;
      return result;
    } catch (error) {
      result.errors.push(`Failed to extract ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Check if a file is a ZIP file based on type and extension
   */
  public isZipFile(file: File): boolean {
    const hasValidType = ZipFileService.VALID_ZIP_TYPES.includes(file.type);
    const hasValidExtension = ZipFileService.VALID_ZIP_EXTENSIONS.some(ext =>
      file.name.toLowerCase().endsWith(ext)
    );

    return hasValidType || hasValidExtension;
  }

  /**
   * Check if a StirlingFileStub represents a ZIP file (for UI checks without loading full file)
   */
  public isZipFileStub(stub: StirlingFileStub): boolean {
    const hasValidType = stub.type && ZipFileService.VALID_ZIP_TYPES.includes(stub.type);
    const hasValidExtension = ZipFileService.VALID_ZIP_EXTENSIONS.some(ext =>
      stub.name.toLowerCase().endsWith(ext)
    );

    return hasValidType || hasValidExtension;
  }

  /**
   * Check if a filename indicates a PDF file
   */
  private isPdfFile(filename: string): boolean {
    return filename.toLowerCase().endsWith('.pdf');
  }

  /**
   * Check if a filename indicates an HTML file
   */
  private isHtmlFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return lowerName.endsWith('.html') || lowerName.endsWith('.htm') || lowerName.endsWith('.xhtml');
  }

  /**
   * Check if a ZIP file contains HTML files
   * Used to determine if the ZIP should be kept intact (HTML) or extracted (other files)
   */
  async containsHtmlFiles(file: Blob | File): Promise<boolean> {
    try {
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(file);

      // Check if any file is an HTML file
      for (const [filename, zipEntry] of Object.entries(zipContents.files)) {
        if (!zipEntry.dir && this.isHtmlFile(filename)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking for HTML files:', error);
      return false;
    }
  }

  /**
   * Validate that a file is actually a PDF by checking its header
   */
  private async isValidPdfFile(file: File): Promise<boolean> {
    try {
      // Read first few bytes to check PDF header
      const buffer = await file.slice(0, 8).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Check for PDF header: %PDF-
      return bytes[0] === 0x25 && // %
             bytes[1] === 0x50 && // P
             bytes[2] === 0x44 && // D
             bytes[3] === 0x46 && // F
             bytes[4] === 0x2D;   // -
    } catch {
      return false;
    }
  }

  /**
   * Sanitize filename for safe use
   */
  private sanitizeFilename(filename: string): string {
    // Remove directory path and get just the filename
    const basename = filename.split('/').pop() || filename;

    // Remove or replace unsafe characters
    return basename
      .replace(/[<>:"/\\|?*]/g, '_') // Replace unsafe chars with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Determine if a ZIP file should be extracted based on user preferences
   * Returns both the extraction decision and file count to avoid redundant ZIP parsing
   *
   * @param zipBlob - The ZIP file to check
   * @param autoUnzip - User preference for auto-unzipping
   * @param autoUnzipFileLimit - Maximum number of files to auto-extract
   * @param skipAutoUnzip - Bypass preference check (for automation)
   * @returns Object with shouldExtract flag and fileCount
   */
  async shouldUnzip(
    zipBlob: Blob | File,
    autoUnzip: boolean,
    autoUnzipFileLimit: number,
    skipAutoUnzip: boolean = false
  ): Promise<{ shouldExtract: boolean; fileCount: number }> {
    try {
      // Automation always extracts - but still need to count files for warning
      if (skipAutoUnzip) {
        const zip = new JSZip();
        const zipContents = await zip.loadAsync(zipBlob);
        const fileCount = Object.values(zipContents.files).filter(entry => !entry.dir).length;
        return { shouldExtract: true, fileCount };
      }

      // Check if auto-unzip is enabled
      if (!autoUnzip) {
        return { shouldExtract: false, fileCount: 0 };
      }

      // Load ZIP and count files (single parse)
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(zipBlob);

      // Count non-directory entries
      const fileCount = Object.values(zipContents.files).filter(entry => !entry.dir).length;

      // Only extract if within limit
      return {
        shouldExtract: fileCount <= autoUnzipFileLimit,
        fileCount
      };
    } catch (error) {
      console.error('Error checking shouldUnzip:', error);
      // On error, default to not extracting (safer)
      return { shouldExtract: false, fileCount: 0 };
    }
  }
  /**
   * Extract files from ZIP with HTML detection and preference checking
   * 1. Check for HTML files → keep zipped if present
   * 2. Check user preferences → respect autoUnzipFileLimit
   * 3. Show warning for large ZIPs (>20 files) if callback provided
   * 4. Extract files if appropriate
   *
   * @param zipBlob - The ZIP blob to process
   * @param options - Extraction options
   * @returns Array of files (either extracted or the ZIP itself)
   */
  async extractWithPreferences(
    zipBlob: Blob,
    options: {
      autoUnzip: boolean;
      autoUnzipFileLimit: number;
      skipAutoUnzip?: boolean;
      confirmLargeExtraction?: (fileCount: number, fileName: string) => Promise<boolean>;
    }
  ): Promise<File[]> {
    try {
      // Create File object if not already
      const zipFile = zipBlob instanceof File
        ? zipBlob
        : new File([zipBlob], 'result.zip', { type: 'application/zip' });

      // Check if ZIP contains HTML files - if so, keep as ZIP
      const containsHtml = await this.containsHtmlFiles(zipFile);
      if (containsHtml) {
        return [zipFile];
      }

      // Check if we should extract based on preferences (returns both decision and count)
      const { shouldExtract, fileCount } = await this.shouldUnzip(
        zipBlob,
        options.autoUnzip,
        options.autoUnzipFileLimit,
        options.skipAutoUnzip || false
      );

      if (!shouldExtract) {
        return [zipFile];
      }

      // Warn user if ZIP is large (fileCount already obtained from shouldUnzip)
      if (fileCount > ZipFileService.ZIP_WARNING_THRESHOLD && options.confirmLargeExtraction) {
        const userConfirmed = await options.confirmLargeExtraction(fileCount, zipFile.name);
        if (!userConfirmed) {
          return [zipFile]; // User cancelled, keep ZIP as-is
        }
      }

      // Extract all files
      const extractionResult = await this.extractAllFiles(zipFile);
      return extractionResult.success ? extractionResult.extractedFiles : [zipFile];
    } catch (error) {
      console.error('Error in extractWithPreferences:', error);
      // On error, return ZIP as-is
      const zipFile = zipBlob instanceof File
        ? zipBlob
        : new File([zipBlob], 'result.zip', { type: 'application/zip' });
      return [zipFile];
    }
  }

  /**
   * Extract all files from a ZIP archive (not limited to PDFs)
   */
  async extractAllFiles(
    file: File | Blob,
    onProgress?: (progress: ZipExtractionProgress) => void
  ): Promise<ZipExtractionResult> {
    const result: ZipExtractionResult = {
      success: false,
      extractedFiles: [],
      errors: [],
      totalFiles: 0,
      extractedCount: 0
    };

    try {
      // Load ZIP contents
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(file);

      // Get all files (not directories)
      const allFiles = Object.entries(zipContents.files).filter(([, zipEntry]) =>
        !zipEntry.dir
      );

      result.totalFiles = allFiles.length;

      // Extract each file
      for (let i = 0; i < allFiles.length; i++) {
        const [filename, zipEntry] = allFiles[i];

        try {
          // Report progress
          if (onProgress) {
            onProgress({
              currentFile: filename,
              extractedCount: i,
              totalFiles: allFiles.length,
              progress: (i / allFiles.length) * 100
            });
          }

          // Extract file content
          const content = await zipEntry.async('blob');

          // Create File object with appropriate MIME type
          const mimeType = this.getMimeTypeFromExtension(filename);
          const extractedFile = new File([content], filename, { type: mimeType });

          result.extractedFiles.push(extractedFile);
          result.extractedCount++;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to extract "${filename}": ${errorMessage}`);
        }
      }

      // Final progress report
      if (onProgress) {
        onProgress({
          currentFile: '',
          extractedCount: result.extractedCount,
          totalFiles: result.totalFiles,
          progress: 100
        });
      }

      result.success = result.extractedFiles.length > 0;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to process ZIP file: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeTypeFromExtension(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop();

    const mimeTypes: Record<string, string> = {
      // Images
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      'tiff': 'image/tiff',
      'tif': 'image/tiff',

      // Documents
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'xml': 'application/xml',

      // Office documents
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

      // Archives
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Extract all files from ZIP and store them in IndexedDB with preserved history metadata
   * Used by both FileManager and FileEditor to avoid code duplication
   *
   * Note: HTML files will NOT be extracted - the ZIP is kept intact when HTML is detected
   *
   * @param zipFile - The ZIP file to extract from
   * @param zipStub - The StirlingFileStub for the ZIP (contains metadata to preserve)
   * @returns Object with success status, extracted stubs, and any errors
   */
  async extractAndStoreFilesWithHistory(
    zipFile: File,
    zipStub: StirlingFileStub
  ): Promise<{ success: boolean; extractedStubs: StirlingFileStub[]; errors: string[] }> {
    const result = {
      success: false,
      extractedStubs: [] as StirlingFileStub[],
      errors: [] as string[]
    };

    try {
      // Check if ZIP contains HTML files - if so, don't extract
      const hasHtml = await this.containsHtmlFiles(zipFile);
      if (hasHtml) {
        result.errors.push('ZIP contains HTML files and will not be auto-extracted. Download the ZIP to access the files.');
        return result;
      }

      // Extract all files from ZIP (not just PDFs)
      const extractionResult = await this.extractAllFiles(zipFile);

      if (!extractionResult.success || extractionResult.extractedFiles.length === 0) {
        result.errors = extractionResult.errors;
        return result;
      }

      // Process each extracted file
      for (const extractedFile of extractionResult.extractedFiles) {
        try {
          // Generate thumbnail (works for PDFs and images)
          const thumbnail = await generateThumbnailForFile(extractedFile);

          // Create StirlingFile
          const newStirlingFile = createStirlingFile(extractedFile);

          // Create StirlingFileStub with ZIP's history metadata
          const stub: StirlingFileStub = {
            id: newStirlingFile.fileId,
            name: extractedFile.name,
            size: extractedFile.size,
            type: extractedFile.type,
            lastModified: extractedFile.lastModified,
            quickKey: newStirlingFile.quickKey,
            createdAt: Date.now(),
            isLeaf: true,
            // Preserve ZIP's history - unzipping is NOT a tool operation
            originalFileId: zipStub.originalFileId,
            parentFileId: zipStub.parentFileId,
            versionNumber: zipStub.versionNumber,
            toolHistory: zipStub.toolHistory || [],
            thumbnailUrl: thumbnail
          };

          // Store in IndexedDB
          await fileStorage.storeStirlingFile(newStirlingFile, stub);

          result.extractedStubs.push(stub);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to process "${extractedFile.name}": ${errorMessage}`);
        }
      }

      result.success = result.extractedStubs.length > 0;
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to extract ZIP file: ${errorMessage}`);
      return result;
    }
  }
}

// Export singleton instance
export const zipFileService = new ZipFileService();
