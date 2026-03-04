// Core stub - no-op implementation for web builds
// Desktop overrides this with actual Tauri implementation

export interface FileWithPath {
  file: File;
  path: string;
  quickKey: string;
}

export interface FileDialogOptions {
  multiple?: boolean;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

/**
 * Open native file dialog and read selected files
 * Core stub - returns empty array (no native dialog in web)
 * Desktop builds override this with actual Tauri implementation
 */
export async function openFileDialog(
  _options?: FileDialogOptions
): Promise<FileWithPath[]> {
  // Web build: no native file dialog support
  return [];
}
