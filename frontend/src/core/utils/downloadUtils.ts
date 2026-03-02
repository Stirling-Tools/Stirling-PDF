import { StirlingFileStub } from '@app/types/fileContext';
import { fileStorage } from '@app/services/fileStorage';
import { zipFileService } from '@app/services/zipFileService';
import { downloadFile } from '@app/services/downloadService';

/**
 * Downloads a blob as a file using browser download API
 * @param blob - The blob to download
 * @param filename - The filename for the download
 */
export function downloadBlob(blob: Blob, filename: string): void {
  void downloadFile({ data: blob, filename });
}

/**
 * Downloads a single file from IndexedDB storage
 * @param file - The file object with storage information
 * @throws Error if file cannot be retrieved from storage
 */
export async function downloadFileFromStorage(file: StirlingFileStub): Promise<void> {
  const lookupKey = file.id;
  const stirlingFile = await fileStorage.getStirlingFile(lookupKey);

  if (!stirlingFile) {
    throw new Error(`File "${file.name}" not found in storage`);
  }

  await downloadFile({
    data: stirlingFile,
    filename: stirlingFile.name,
    localPath: file.localFilePath
  });
}

/**
 * Downloads multiple files as individual downloads
 * @param files - Array of files to download
 */
export async function downloadMultipleFiles(files: StirlingFileStub[]): Promise<void> {
  for (const file of files) {
    await downloadFileFromStorage(file);
  }
}

/**
 * Downloads multiple files as a single ZIP archive
 * @param files - Array of files to include in ZIP
 * @param zipFilename - Optional custom ZIP filename (defaults to timestamped name)
 */
export async function downloadFilesAsZip(files: StirlingFileStub[], zipFilename?: string): Promise<void> {
  if (files.length === 0) {
    throw new Error('No files provided for ZIP download');
  }

  // Convert stored files to File objects
  const filesToZip: File[] = [];
  for (const fileWithUrl of files) {
    const lookupKey = fileWithUrl.id;
    const stirlingFile = await fileStorage.getStirlingFile(lookupKey);

    if (stirlingFile) {
      // StirlingFile is already a File object!
      filesToZip.push(stirlingFile);
    }
  }

  if (filesToZip.length === 0) {
    throw new Error('No valid files found in storage for ZIP download');
  }

  // Generate default filename if not provided
  const finalZipFilename = zipFilename ||
    `files-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.zip`;

  // Create and download ZIP
  const { zipFile } = await zipFileService.createZipFromFiles(filesToZip, finalZipFilename);
  await downloadFile({ data: zipFile, filename: finalZipFilename });
}

/**
 * Smart download function that handles single or multiple files appropriately
 * - Single file: Downloads directly
 * - Multiple files: Downloads as ZIP
 * @param files - Array of files to download
 * @param options - Download options
 */
export async function downloadFiles(
  files: StirlingFileStub[],
  options: {
    forceZip?: boolean;
    zipFilename?: string;
    multipleAsIndividual?: boolean;
  } = {}
): Promise<void> {
  if (files.length === 0) {
    throw new Error('No files provided for download');
  }

  if (files.length === 1 && !options.forceZip) {
    // Single file download
    await downloadFileFromStorage(files[0]);
  } else if (options.multipleAsIndividual) {
    // Multiple individual downloads
    await downloadMultipleFiles(files);
  } else {
    // ZIP download (default for multiple files)
    await downloadFilesAsZip(files, options.zipFilename);
  }
}

/**
 * Downloads a File object directly (for files already in memory)
 * @param file - The File object to download
 * @param filename - Optional custom filename
 */
export function downloadFileObject(file: File, filename?: string): void {
  void downloadFile({ data: file, filename: filename || file.name });
}

/**
 * Downloads text content as a file
 * @param content - Text content to download
 * @param filename - Filename for the download
 * @param mimeType - MIME type (defaults to text/plain)
 */
export function downloadTextAsFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
): void {
  const blob = new Blob([content], { type: mimeType });
  void downloadFile({ data: blob, filename });
}

/**
 * Downloads JSON data as a file
 * @param data - Data to serialize and download
 * @param filename - Filename for the download
 */
export function downloadJsonAsFile(data: any, filename: string): void {
  const content = JSON.stringify(data, null, 2);
  downloadTextAsFile(content, filename, 'application/json');
}
