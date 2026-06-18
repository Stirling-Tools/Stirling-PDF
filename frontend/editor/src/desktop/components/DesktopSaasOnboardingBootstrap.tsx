import { useEffect, useState } from "react";
import { useAuth } from "@app/auth/UseSession";
import SaasOnboardingModal from "@app/components/onboarding/SaasOnboardingModal";

/**
 * Desktop bootstrap for the SaaS product onboarding.
 *
 * Mirrors saas's {@code OnboardingBootstrap}: once a SaaS user has signed in we
 * show the shared cloud {@link SaasOnboardingModal} (free-editor pitch → usage
 * meter → team), reusing the exact same flow as the web app. The closing
 * "download desktop" slide is dropped via {@code hideDesktopInstall} — this IS
 * the desktop app, so pitching its own download makes no sense.
 *
 * Differences from the saas bootstrap:
 * - The desktop {@code useAuth} (proprietary) exposes no pro/wallet fields; the
 *   cloud flow reads the live wallet itself to decide which slides to show, so
 *   we just wait for a non-anonymous signed-in user.
 * - Gated on {@code connectionMode === "saas"} so it never fires in local or
 *   self-hosted mode (where there is no SaaS wallet/team to onboard).
 *
 * Shown once per device, gated by localStorage (same key the saas web flow uses
 * so a user who onboarded on the web isn't re-onboarded — they are independent
 * stores, but the key/intent is shared).
 */
const STORAGE_KEY = "saas_onboarding_seen";

interface DesktopSaasOnboardingBootstrapProps {
  connectionMode: "saas" | "selfhosted" | "local" | null;
}

export function DesktopSaasOnboardingBootstrap({
  connectionMode,
}: DesktopSaasOnboardingBootstrapProps) {
  const { user, loading } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const isSignedInSaasUser =
    connectionMode === "saas" &&
    !loading &&
    !!user &&
    user.is_anonymous !== true;

  useEffect(() => {
    if (!isSignedInSaasUser) return;
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // localStorage unavailable — fail open and show onboarding.
    }
    if (!seen) {
      setShowModal(true);
    }
  }, [isSignedInSaasUser]);

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage unavailable — best-effort; the in-memory flag still hides it.
    }
    setShowModal(false);
  };

  if (!showModal) return null;

  return (
    <SaasOnboardingModal
      opened={showModal}
      onClose={handleClose}
      hideDesktopInstall
    />
  );
}
