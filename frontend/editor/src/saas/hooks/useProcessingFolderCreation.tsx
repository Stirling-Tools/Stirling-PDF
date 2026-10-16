import { useProcessingFolderCreation as useBaseProcessingFolderCreation } from "@proprietary/hooks/useProcessingFolderCreation";
import { useAuth } from "@app/auth/UseSession";
import { requestProcessorSignup } from "@app/services/processorSignup";

export { canCreateProcessingFolders } from "@proprietary/hooks/useProcessingFolderCreation";
export type { ProcessingFolderCreation } from "@proprietary/hooks/useProcessingFolderCreation";

/** Both landing-page and editor actions require an account before mounting the setup wizard. */
export function useProcessingFolderCreation() {
  const { isAnonymous } = useAuth();
  const creation = useBaseProcessingFolderCreation();
  return isAnonymous
    ? { open: requestProcessorSignup, dialog: null }
    : creation;
}
