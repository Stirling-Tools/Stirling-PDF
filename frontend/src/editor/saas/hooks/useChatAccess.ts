import { useAuth } from "@editor/auth/UseSession";
import { requestProcessorSignup } from "@editor/services/processorSignup";

/** Guests see the shared signup prompt; a false result means chat must stay closed. */
export function useChatAccess(): () => boolean {
  const { isAnonymous } = useAuth();
  return () => {
    if (isAnonymous) {
      requestProcessorSignup();
      return false;
    }
    return true;
  };
}
