import { useEffect } from "react";
import { useUI } from "@portal/contexts/UIContext";
import {
  acknowledgeAccountLinkPrompt,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

/** Mount alongside the single link dialog; repeat failures leave the persistent rail in place. */
export function useFreeTierExhaustedPrompt(enabled = true): void {
  const { openLinkModal, linkModalOpen } = useUI();
  const { promptPending } = useAccountLinkBlock();

  useEffect(() => {
    if (!enabled || !promptPending) return;
    acknowledgeAccountLinkPrompt();
    if (!linkModalOpen) openLinkModal("exhausted");
  }, [enabled, promptPending, linkModalOpen, openLinkModal]);
}
