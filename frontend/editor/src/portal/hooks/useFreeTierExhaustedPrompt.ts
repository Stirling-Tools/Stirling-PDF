import { useEffect } from "react";
import { useUI } from "@app/portal/contexts/UIContext";
import { useLink } from "@app/portal/contexts/LinkContext";
import {
  acknowledgeAccountLinkPrompt,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

/** Mount alongside the single link dialog; repeat failures leave the persistent rail in place. */
export function useFreeTierExhaustedPrompt(enabled = true): void {
  const { isLinked } = useLink();
  const { openLinkModal, linkModalOpen } = useUI();
  const { promptPending, context } = useAccountLinkBlock();

  useEffect(() => {
    if (!enabled || isLinked || !promptPending) return;
    acknowledgeAccountLinkPrompt();
    if (!linkModalOpen) openLinkModal("exhausted", context);
  }, [enabled, isLinked, promptPending, context, linkModalOpen, openLinkModal]);
}
