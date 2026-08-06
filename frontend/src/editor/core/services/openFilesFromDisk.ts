import { openFileDialog } from "@editor/services/fileDialogService";
import { pendingFilePathMappings } from "@editor/services/pendingFilePathMappings";
import { getDocumentFileDialogFilter } from "@editor/utils/fileDialogUtils";

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
    for (const { quickKey, path } of filesWithPaths) {
      pendingFilePathMappings.set(quickKey, path);
    }
    return filesWithPaths.map((entry) => entry.file);
  }

  options.onFallbackOpen?.();
  return [];
}
