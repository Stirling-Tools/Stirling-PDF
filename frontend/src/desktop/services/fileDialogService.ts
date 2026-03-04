// Desktop implementation - Tauri native file dialogs
import type { FileWithPath, FileDialogOptions } from '@core/services/fileDialogService';
import { createQuickKey } from '@app/types/fileContext';
import { getDocumentFileDialogFilter } from '@app/utils/fileDialogUtils';

export type { FileWithPath, FileDialogOptions };

/**
 * Open native file dialog and read selected files (Desktop/Tauri only)
 */
export async function openFileDialog(
  options?: FileDialogOptions
): Promise<FileWithPath[]> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');

    console.log('[FileDialog] Opening file dialog...');
    const selectedPaths = await open({
      multiple: options?.multiple ?? true,
      filters: options?.filters ?? getDocumentFileDialogFilter()
    });

    if (!selectedPaths) {
      console.log('[FileDialog] User cancelled');
      return [];
    }

    const paths = Array.isArray(selectedPaths) ? selectedPaths : [selectedPaths];
    console.log(`[FileDialog] Selected ${paths.length} file(s):`, paths);

    const filesWithPaths: FileWithPath[] = [];

    for (const filePath of paths) {
      try {
        console.log(`[FileDialog] Reading file: ${filePath}`);
        const fileData = await readFile(filePath);
        const fileName = filePath.split(/[/\\]/).pop() || 'document';
        const file = new File([fileData], fileName, {
          type: fileName.endsWith('.pdf') ? 'application/pdf' : undefined
        });
        const quickKey = createQuickKey(file);
        console.log(`[FileDialog] Created File: ${fileName}, quickKey: ${quickKey}`);

        filesWithPaths.push({
          file,
          path: filePath,
          quickKey
        });
      } catch (error) {
        console.error(`[FileDialog] Failed to read ${filePath}:`, error);
      }
    }

    return filesWithPaths;
  } catch (error) {
    console.error('[FileDialog] Error:', error);
    return [];
  }
}
