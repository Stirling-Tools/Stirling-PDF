/**
 * Wallet snapshot for the PAYG Plan page. Returns enough state for
 * {@link PlanSection} to pick between the four views:
 *
 *   - free + leader → {@code PaygFreeLeader}   (CTA to enable Processor)
 *   - free + member → {@code PaygFreeMember}   (ask-owner note)
 *   - subscribed + leader → {@code PaygLeader} (full dashboard, editable cap)
 *   - subscribed + member → {@code PaygMember} (member dashboard)
 *
 * <p><b>Mock-first.</b> Until the {@code GET /api/v1/payg/wallet} backend
 * endpoint lands, subscription state is read from {@code localStorage}
 * (key {@code stirling.payg.devSubscription}). That gives us:
 *   - A demoable upgrade loop — the modal's {@code onComplete} flips the flag
 *     so the page rerenders into the subscribed view without a real Stripe
 *     round-trip.
 *   - A simple way to toggle states manually during review
 *     ({@code localStorage.setItem('stirling.payg.devSubscription', 'subscribed')}).
 *
 * <p>Leader vs member is sourced from {@code appConfig.isAdmin} for now — same
 * proxy {@code saasConfigNavSections.tsx} already uses until a real team-role
 * lookup ships.
 *
 * <p>The detailed usage/cap/member numbers used by the four view components
 * still come from their own internal mocks (kept colocated for design
 * iteration). When the backend endpoint lands, this hook absorbs them and
 * the components read from {@code Wallet} directly.
 */
import { useCallback, useEffect, useState } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";

/** Subscription state for the PAYG plan. */
export type WalletStatus = "free" | "subscribed";

/** Viewer's role on the current team. */
export type WalletRole = "leader" | "member";

export interface Wallet {
  /** Whether the team has an active Processor (PAYG) subscription. */
  status: WalletStatus;
  /** Viewer's role on the team. */
  role: WalletRole;
}

export interface UseWalletResult {
  wallet: Wallet;
  /**
   * Optimistically flip the cached subscription state. Called by
   * {@code UpgradeModal.onComplete} so the rendered view swaps immediately;
   * real wiring will instead refetch from the backend.
   */
  markSubscribed: () => void;
  /** Symmetric helper for demo / cancellation flows. */
  markFree: () => void;
}

const STORAGE_KEY = "stirling.payg.devSubscription";

function readSubscriptionFromStorage(): WalletStatus {
  if (typeof window === "undefined") {
    return "free";
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "subscribed" ? "subscribed" : "free";
  } catch {
    return "free";
  }
}

function writeSubscriptionToStorage(status: WalletStatus): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, status);
  } catch {
    // Storage unavailable (private mode, etc.) — silently degrade.
  }
}

export function useWallet(): UseWalletResult {
  const { config: appConfig } = useAppConfig();
  const [status, setStatus] = useState<WalletStatus>(() =>
    readSubscriptionFromStorage(),
  );

  // Pick up cross-tab updates so toggling the localStorage flag in devtools
  // is reflected without a hard refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setStatus(readSubscriptionFromStorage());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const role: WalletRole = appConfig?.isAdmin ? "leader" : "member";

  const markSubscribed = useCallback(() => {
    writeSubscriptionToStorage("subscribed");
    setStatus("subscribed");
  }, []);

  const markFree = useCallback(() => {
    writeSubscriptionToStorage("free");
    setStatus("free");
  }, []);

  return {
    wallet: { status, role },
    markSubscribed,
    markFree,
  };
}
