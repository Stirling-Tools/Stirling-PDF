import type { FileId, StirlingFileStub } from '@app/types/fileContext';

export interface FileDiskDeleteResult {
  deletedIds: FileId[];
  failed: Array<{ name: string; error: string }>;
  cancelled?: boolean;
}

export function canDeleteFromDisk(_file: StirlingFileStub): boolean {
  return false;
}

export function canDeleteSelectedFromDisk(_files: StirlingFileStub[]): boolean {
  return false;
}

export async function deleteFromDisk(_files: StirlingFileStub[]): Promise<FileDiskDeleteResult> {
  return { deletedIds: [], failed: [], cancelled: true };
}
