import { useEffect, useState } from "react";
import { FreeLimitReachedModal } from "@app/components/shared/FreeLimitReachedModal";
import { SpendCapReachedModal } from "@app/components/shared/SpendCapReachedModal";
import {
  FREE_LIMIT_MODAL_EVENT,
  SPEND_CAP_MODAL_EVENT,
} from "@app/components/usageLimitModals";
import {
  PAYG_LIMIT_REACHED_EVENT,
  type PaygLimitReachedDetail,
} from "@app/services/usageLimitBridge";

/**
 * Always-mounted host for the usage-limit warning modals. Mount once (in
 * App.tsx); it renders nothing until openFreeLimitModal()/openSpendCapModal()
 * (see usageLimitModals.ts) fire their bridge events. Each modal is mounted
 * only while open, so it reads the wallet (and animates in) on open rather
 * than on app load.
 *
 * <p>Also bridges the server-side run paths (policy auto-run, AI agent): their tool
 * calls run server-side, so a usage-limit 402 never reaches the apiClient interceptor
 * that pops these modals for direct calls. Those proprietary paths broadcast {@link
 * PAYG_LIMIT_REACHED_EVENT} (with the blocking 402's {@code subscribed} flag) instead;
 * we open the matching modal here.
 */
export default function UsageLimitModalHost() {
  const [freeOpen, setFreeOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);

  useEffect(() => {
    const onFree = () => setFreeOpen(true);
    const onSpend = () => setSpendOpen(true);
    const onServerLimit = (e: Event) => {
      const subscribed = (e as CustomEvent<PaygLimitReachedDetail>).detail
        ?.subscribed;
      if (subscribed) setSpendOpen(true);
      else setFreeOpen(true);
    };
    window.addEventListener(FREE_LIMIT_MODAL_EVENT, onFree);
    window.addEventListener(SPEND_CAP_MODAL_EVENT, onSpend);
    window.addEventListener(PAYG_LIMIT_REACHED_EVENT, onServerLimit);
    return () => {
      window.removeEventListener(FREE_LIMIT_MODAL_EVENT, onFree);
      window.removeEventListener(SPEND_CAP_MODAL_EVENT, onSpend);
      window.removeEventListener(PAYG_LIMIT_REACHED_EVENT, onServerLimit);
    };
  }, []);

  return (
    <>
      {freeOpen && <FreeLimitReachedModal onClose={() => setFreeOpen(false)} />}
      {spendOpen && (
        <SpendCapReachedModal onClose={() => setSpendOpen(false)} />
      )}
    </>
  );
}
