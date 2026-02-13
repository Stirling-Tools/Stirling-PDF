import type { FileDiskDeleteResult } from '@core/services/fileDiskActionService';
import type { FileId, StirlingFileStub } from '@app/types/fileContext';
import { deleteLocalFile } from '@app/services/localFileSaveService';

export type { FileDiskDeleteResult };

export function canDeleteFromDisk(file: StirlingFileStub): boolean {
  return Boolean(file.localFilePath);
}

export function canDeleteSelectedFromDisk(files: StirlingFileStub[]): boolean {
  return files.some(file => Boolean(file.localFilePath));
}

function confirmDeleteFromDisk(files: Array<{ name: string; path: string }>): boolean {
  if (files.length === 0) return false;
  const fileList = files.map(file => `• ${file.name}`).join('\n');
  const message = files.length === 1
    ? `Delete "${files[0].name}" from disk?\n\nThis will permanently delete the file from:\n${files[0].path}`
    : `Delete ${files.length} files from disk?\n\n${fileList}\n\nThis will permanently delete these files from your computer.`;
  return window.confirm(message);
}

export async function deleteFromDisk(files: StirlingFileStub[]): Promise<FileDiskDeleteResult> {
  const targets = files
    .filter(file => file.localFilePath)
    .map(file => ({ file, path: file.localFilePath as string }));

  if (targets.length === 0) {
    return { deletedIds: [], failed: [], cancelled: true };
  }

  if (!confirmDeleteFromDisk(targets.map(target => ({ name: target.file.name, path: target.path })))) {
    return { deletedIds: [], failed: [], cancelled: true };
  }

  const deletedIds: FileId[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const target of targets) {
    const result = await deleteLocalFile(target.path);
    if (result.success) {
      deletedIds.push(target.file.id);
    } else if (result.error) {
      failed.push({ name: target.file.name, error: result.error });
    }
  }

  return { deletedIds, failed };
}
