import type { FolderProcessingSetupProps } from "@core/components/policies/FolderProcessingSetup";
import { ProcessingFolderSetupFlow } from "@app/components/policies/ProcessingFolderSetupFlow";

export type { FolderProcessingSetupProps };

/** Existing-folder entry skips destination selection and preserves saved processing. */
export function FolderProcessingSetup({
  folder,
  onClose,
}: FolderProcessingSetupProps) {
  return folder ? (
    <ProcessingFolderSetupFlow
      key={folder.id}
      folder={folder}
      onClose={onClose}
    />
  ) : null;
}
