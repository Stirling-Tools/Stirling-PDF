// Core stub - no-op implementation for web builds
// Desktop overrides this with actual Tauri implementation

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface MultiFileSaveResult {
  success: boolean;
  savedCount: number;
  cancelledByUser?: boolean;
  error?: string;
}

/**
 * Save file data to a local filesystem path
 * Core stub - always returns failure
 * Desktop builds override this with actual implementation
 */
export async function saveToLocalPath(
  _data: Blob | File,
  _filePath: string
): Promise<SaveResult> {
  return { success: false, error: "Local file save not available in web mode" };
}

/**
 * Check if auto-save should be performed
 * Core stub - always returns false
 */
export function shouldAutoSave(_inputCount: number, _outputCount: number): boolean {
  return false;
}

/**
 * Delete a file from local filesystem
 * Core stub - always returns failure
 */
export async function deleteLocalFile(_filePath: string): Promise<SaveResult> {
  return { success: false, error: "Local file delete not available in web mode" };
}

/**
 * Show native save dialog
 * Core stub - always returns null
 */
export async function showSaveDialog(
  _defaultFilename: string,
  _defaultDirectory?: string
): Promise<string | null> {
  return null;
}

/**
 * Prompt user to select folder and save multiple files
 * Core stub - always returns failure
 */
export async function saveMultipleFilesWithPrompt(
  _files: (Blob | File)[],
  _defaultDirectory?: string
): Promise<MultiFileSaveResult> {
  return { success: false, savedCount: 0, error: "Multi-file save not available in web mode" };
}

export function isDesktopFileAccessAvailable(): boolean {
  return false;
}
