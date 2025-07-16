import JSZip from 'jszip';

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
  private readonly supportedExtensions = ['.pdf'];

  /**
   * Validate a ZIP file without extracting it
   */
  async validateZipFile(file: File): Promise<ZipValidationResult> {
    const result: ZipValidationResult = {
      isValid: false,
      fileCount: 0,
      totalSizeBytes: 0,
      containsPDFs: false,
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
        const uncompressedSize = zipEntry._data?.uncompressedSize || 0;
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
      result.isValid = result.errors.length === 0 && containsPDFs;

      if (!containsPDFs) {
        result.errors.push('ZIP file does not contain any PDF files');
      }

      return result;
    } catch (error) {
      result.errors.push(`Failed to validate ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
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
          const extractedFile = new File([content], this.sanitizeFilename(filename), {
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
  private isZipFile(file: File): boolean {
    const validTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-zip',
      'application/octet-stream' // Some browsers use this for ZIP files
    ];

    const validExtensions = ['.zip'];
    const hasValidType = validTypes.includes(file.type);
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
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
    } catch (error) {
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
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    return filename.substring(filename.lastIndexOf('.')).toLowerCase();
  }

  /**
   * Check if ZIP file contains password protection
   */
  private async isPasswordProtected(file: File): Promise<boolean> {
    try {
      const zip = new JSZip();
      await zip.loadAsync(file);
      
      // Check if any files are encrypted
      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.options?.compression === 'STORE' && zipEntry._data?.compressedSize === 0) {
          // This might indicate encryption, but JSZip doesn't provide direct encryption detection
          // We'll handle this in the extraction phase
        }
      }
      
      return false; // JSZip will throw an error if password is required
    } catch (error) {
      // If we can't load the ZIP, it might be password protected
      const errorMessage = error instanceof Error ? error.message : '';
      return errorMessage.includes('password') || errorMessage.includes('encrypted');
    }
  }
}

// Export singleton instance
export const zipFileService = new ZipFileService();