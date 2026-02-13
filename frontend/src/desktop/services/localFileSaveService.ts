import type { SaveResult, MultiFileSaveResult } from "@core/services/localFileSaveService";
export type { SaveResult, MultiFileSaveResult };

/**
 * Save file data to a local filesystem path (Tauri desktop only)
 *
 * @param data - Blob or File to save
 * @param filePath - Absolute path to save to
 * @returns Result indicating success or failure with error message
 */
export async function saveToLocalPath(
  data: Blob | File,
  filePath: string
): Promise<SaveResult> {
  try {
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const arrayBuffer = await data.arrayBuffer();
    await writeFile(filePath, new Uint8Array(arrayBuffer));
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[LocalFileSave] Failed to save:', message);
    return { success: false, error: message };
  }
}

/**
 * Check if auto-save should be performed for this operation
 *
 * @param inputCount - Number of input files
 * @param outputCount - Number of output files
 * @returns True if auto-save conditions are met
 */
export function shouldAutoSave(inputCount: number, outputCount: number): boolean {
  return inputCount === 1 && outputCount === 1;
}

/**
 * Delete a file from local filesystem (Tauri desktop only)
 *
 * @param filePath - Absolute path to delete
 * @returns Result indicating success or failure
 */
export async function deleteLocalFile(filePath: string): Promise<SaveResult> {
  try {
    const { remove } = await import("@tauri-apps/plugin-fs");
    await remove(filePath);
    console.log(`[LocalFileDelete] Deleted: ${filePath}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[LocalFileDelete] Failed to delete:', message);
    return { success: false, error: message };
  }
}

/**
 * Show native save dialog and return selected path
 *
 * @param defaultFilename - Suggested filename
 * @param defaultDirectory - Optional default directory
 * @returns Selected file path or null if cancelled
 */
export async function showSaveDialog(
  defaultFilename: string,
  defaultDirectory?: string
): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");

    const selectedPath = await save({
      defaultPath: defaultDirectory ? `${defaultDirectory}/${defaultFilename}` : defaultFilename,
      filters: [{
        name: 'PDF',
        extensions: ['pdf']
      }],
      title: 'Save As'
    });

    return selectedPath;
  } catch (error) {
    console.error('[SaveDialog] Failed to show dialog:', error);
    return null;
  }
}

/**
 * Prompt user to select a folder and save multiple files there
 *
 * @param files - Array of files to save
 * @param defaultDirectory - Optional default directory to open dialog in
 * @returns Result with count of files saved
 */
export async function saveMultipleFilesWithPrompt(
  files: (Blob | File)[],
  defaultDirectory?: string
): Promise<MultiFileSaveResult> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const { join } = await import("@tauri-apps/api/path");

    // Prompt user to select folder
    const selectedFolder = await open({
      directory: true,
      multiple: false,
      defaultPath: defaultDirectory,
      title: `Save ${files.length} file${files.length > 1 ? 's' : ''}`
    });

    // User cancelled
    if (!selectedFolder) {
      return { success: false, savedCount: 0, cancelledByUser: true };
    }

    // Save each file to the selected folder
    let savedCount = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        const fileName = file instanceof File ? file.name : `output_${savedCount + 1}.pdf`;
        const filePath = await join(selectedFolder as string, fileName);
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filePath, new Uint8Array(arrayBuffer));
        savedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${file instanceof File ? file.name : 'file'}: ${message}`);
      }
    }

    if (savedCount === files.length) {
      return { success: true, savedCount };
    } else if (savedCount > 0) {
      return {
        success: false,
        savedCount,
        error: `Saved ${savedCount}/${files.length} files. Errors: ${errors.join(', ')}`
      };
    } else {
      return {
        success: false,
        savedCount: 0,
        error: `Failed to save files: ${errors.join(', ')}`
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[LocalFileSave] Failed to save multiple files:', message);
    return { success: false, savedCount: 0, error: message };
  }
}

export function isDesktopFileAccessAvailable(): boolean {
  return true;
}
