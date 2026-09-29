import type { FolderRecord } from "@app/types/folder";

export interface FolderProcessingSetupProps {
  /** The folder being set up; null keeps the dialog closed. */
  folder: FolderRecord | null;
  onClose: () => void;
}

/**
 * Core stub for the folder-processing setup dialog. The real implementation lives at
 * the same path under proprietary/ and shadows this via the @app/* alias cascade.
 */
export function FolderProcessingSetup(_props: FolderProcessingSetupProps) {
  return null;
}
