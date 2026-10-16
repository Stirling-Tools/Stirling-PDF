import {
  hasNativeFileDialog,
  openFileDialog,
} from "@app/services/fileDialogService";
import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";
import { getDocumentFileDialogFilter } from "@app/utils/fileDialogUtils";

interface OpenFilesFromDiskOptions {
  multiple?: boolean;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  onFallbackOpen?: () => void;
}

export async function openFilesFromDisk(
  options: OpenFilesFromDiskOptions = {},
): Promise<File[]> {
  const filesWithPaths = await openFileDialog({
    multiple: options.multiple ?? true,
    filters: options.filters ?? getDocumentFileDialogFilter(),
  });

  if (filesWithPaths.length > 0) {
    for (const { file, path } of filesWithPaths) {
      pendingFilePathMappings.set(file, path);
    }
    return filesWithPaths.map((entry) => entry.file);
  }

  if (!hasNativeFileDialog) options.onFallbackOpen?.();
  return [];
}
