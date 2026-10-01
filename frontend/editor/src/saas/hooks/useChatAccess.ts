import { useAuth } from "@app/auth/UseSession";
import { requestProcessorSignup } from "@app/services/processorSignup";

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
