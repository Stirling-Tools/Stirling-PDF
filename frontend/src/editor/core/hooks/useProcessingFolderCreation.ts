import type { ReactNode } from "react";

export const canCreateProcessingFolders = false;

export interface ProcessingFolderCreation {
  /** Absent when this build has no processing service. */
  open?: () => void;
  dialog: ReactNode;
}

/** Render the dialog within the same providers as the component calling this hook. */
export function useProcessingFolderCreation(): ProcessingFolderCreation {
  return { dialog: null };
}
