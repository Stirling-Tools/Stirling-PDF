import { fileStorage } from "@app/services/fileStorage";
import type { FileId } from "@app/types/file";

/** Whether the document is still in this browser. The id is this workspace's own, so only it can say. */
export async function hasLocalFile(fileId: string | null): Promise<boolean> {
  if (!isUsableId(fileId)) return false;

  try {
    const stub = await fileStorage.getStirlingFileStub(fileId as FileId);
    return stub !== null;
  } catch {
    return false;
  }
}

function isUsableId(fileId: string | null | undefined): fileId is string {
  return typeof fileId === "string" && fileId.trim() !== "";
}
