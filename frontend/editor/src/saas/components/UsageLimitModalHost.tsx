import { useEffect, useState } from "react";
import { FreeLimitReachedModal } from "@app/components/shared/FreeLimitReachedModal";
import { SpendCapReachedModal } from "@app/components/shared/SpendCapReachedModal";
import {
  FREE_LIMIT_MODAL_EVENT,
  SPEND_CAP_MODAL_EVENT,
} from "@app/components/usageLimitModals";

/**
 * Always-mounted host for the usage-limit warning modals. Mount once (in
 * App.tsx); it renders nothing until openFreeLimitModal()/openSpendCapModal()
 * (see usageLimitModals.ts) fire their bridge events. Each modal is mounted
 * only while open, so it reads the wallet (and animates in) on open rather
 * than on app load.
 */
export default function UsageLimitModalHost() {
  const [freeOpen, setFreeOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);

  useEffect(() => {
    const onFree = () => setFreeOpen(true);
    const onSpend = () => setSpendOpen(true);
    window.addEventListener(FREE_LIMIT_MODAL_EVENT, onFree);
    window.addEventListener(SPEND_CAP_MODAL_EVENT, onSpend);
    return () => {
      window.removeEventListener(FREE_LIMIT_MODAL_EVENT, onFree);
      window.removeEventListener(SPEND_CAP_MODAL_EVENT, onSpend);
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
