import type { FolderRecord } from "@app/types/folder";

export interface FolderProcessingSetupProps {
  /** The folder being set up; null keeps the dialog closed. */
  folder: FolderRecord | null;
  onClose: () => void;
}

/**
 * Core stub for the folder-processing setup dialog.
 *
 * The real implementation lives in
 * {@code proprietary/components/policies/FolderProcessingSetup.tsx} and shadows this stub via the
 * {@code @app/*} alias cascade. Core builds have no processing folders, so this renders nothing;
 * the menu entry that opens it never shows there either.
 */
export function FolderProcessingSetup(_props: FolderProcessingSetupProps) {
  return null;
}
