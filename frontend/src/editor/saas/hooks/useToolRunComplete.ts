import { useCallback, useRef } from "react";
import { useAuth } from "@editor/auth/UseSession";
import { recordGuestToolRun } from "@editor/services/guestToolReminder";
import { requestProcessorSignup } from "@editor/services/processorSignup";

/** Counts completed manual runs for the same guest session and offers a dismissible signup reminder. */
export function useToolRunComplete(): () => void {
  const { isAnonymous, user } = useAuth();
  const guestId = isAnonymous ? user?.id : undefined;
  const currentGuestId = useRef(guestId);
  currentGuestId.current = guestId;

  return useCallback(() => {
    if (!guestId || currentGuestId.current !== guestId) return;
    if (recordGuestToolRun(guestId)) requestProcessorSignup();
  }, [guestId]);
}
