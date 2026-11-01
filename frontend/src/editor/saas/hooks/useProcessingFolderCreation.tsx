import { useProcessingFolderCreation as useBaseProcessingFolderCreation } from "@editor-proprietary/hooks/useProcessingFolderCreation";
import { useAuth } from "@editor/auth/UseSession";
import { requestProcessorSignup } from "@editor/services/processorSignup";

export { canCreateProcessingFolders } from "@editor-proprietary/hooks/useProcessingFolderCreation";
export type { ProcessingFolderCreation } from "@editor-proprietary/hooks/useProcessingFolderCreation";

/** Both landing-page and editor actions require an account before mounting the setup wizard. */
export function useProcessingFolderCreation() {
  const { isAnonymous } = useAuth();
  const creation = useBaseProcessingFolderCreation();
  return isAnonymous
    ? { open: requestProcessorSignup, dialog: null }
    : creation;
}
