import { useCallback } from "react";
import licenseService, { PlanTier } from "@app/services/licenseService";
import { resyncExistingLicense } from "@app/utils/licenseCheckoutUtils";
import {
  createServerPlanCheckoutSession,
  type ServerPlanCheckoutRequest,
  type ServerPlanCheckoutSession,
} from "@app/services/serverPlanCheckout";
import { getCheckoutMode } from "@app/utils/protocolDetection";
import { absoluteWithBasePath } from "@app/constants/app";
import {
  CheckoutState,
  PollingStatus,
} from "@app/components/shared/stripeCheckout/types/checkout";

/**
 * Mints the Stripe session a plan purchase is paid through. Injectable so a test can drive the
 * stages without a Supabase client, and so the transport stays one named thing rather than a
 * hard-coded import in the middle of the stage machine.
 */
export type CheckoutSessionCreator = (
  request: ServerPlanCheckoutRequest,
) => Promise<ServerPlanCheckoutSession>;

/**
 * Checkout session creation and payment handling hook
 */
export const useCheckoutSession = (
  selectedPlan: PlanTier | null,
  state: CheckoutState,
  setState: React.Dispatch<React.SetStateAction<CheckoutState>>,
  installationId: string | null,
  setInstallationId: React.Dispatch<React.SetStateAction<string | null>>,
  currentLicenseKey: string | null,
  setCurrentLicenseKey: React.Dispatch<React.SetStateAction<string | null>>,
  setPollingStatus: React.Dispatch<React.SetStateAction<PollingStatus>>,
  minimumSeats: number,
  serverQuantity: number,
  pollForLicenseKey: (installId: string) => Promise<void>,
  onSuccess?: (sessionId: string) => void,
  onError?: (error: string) => void,
  onLicenseActivated?: (licenseInfo: {
    licenseType: string;
    enabled: boolean;
    maxUsers: number;
    hasKey: boolean;
  }) => void,
  createSession: CheckoutSessionCreator = createServerPlanCheckoutSession,
) => {
  const createCheckoutSession = useCallback(async () => {
    if (!selectedPlan) {
      setState({
        currentStage: "error",
        error: "Selected plan period is not available",
        loading: false,
      });
      return;
    }

    try {
      setState((prev) => ({ ...prev, loading: true }));

      // Fetch installation ID from backend
      let fetchedInstallationId = installationId;
      if (!fetchedInstallationId) {
        fetchedInstallationId = await licenseService.getInstallationId();
        setInstallationId(fetchedInstallationId);
      }

      // Fetch current license key for upgrades
      // Only include if it's a valid PRO/ENTERPRISE license (not NORMAL/free tier)
      let existingLicenseKey: string | undefined;
      try {
        const licenseInfo = await licenseService.getLicenseInfo();
        if (
          licenseInfo?.licenseType &&
          licenseInfo.licenseType !== "NORMAL" &&
          licenseInfo.licenseKey
        ) {
          existingLicenseKey = licenseInfo.licenseKey;
          setCurrentLicenseKey(existingLicenseKey);
          console.log("Found existing valid license for upgrade");
        }
      } catch (error) {
        console.warn(
          "Could not fetch license info, proceeding as new license:",
          error,
        );
      }

      // Stripe's embedded iframe needs a secure context, so a plain-HTTP instance sends the buyer
      // to Stripe's own page and needs the two return URLs up front.
      const uiMode = getCheckoutMode();
      const returnTo = absoluteWithBasePath("/settings/adminPlan");
      const response = await createSession({
        lookupKey: selectedPlan.lookupKey,
        serverQuantity: Math.max(1, serverQuantity || 1),
        requiresSeats: selectedPlan.requiresSeats,
        seatCount: Math.max(1, Math.min(minimumSeats || 1, 10000)),
        installationId: fetchedInstallationId ?? undefined,
        currentLicenseKey: existingLicenseKey,
        uiMode,
        successUrl:
          uiMode === "hosted"
            ? `${returnTo}?session_id={CHECKOUT_SESSION_ID}&payment_status=success`
            : undefined,
        cancelUrl:
          uiMode === "hosted"
            ? `${returnTo}?payment_status=canceled`
            : undefined,
      });

      if (response.url) {
        window.location.href = response.url;
        return;
      }

      setState((prev) => ({
        ...prev,
        clientSecret: response.clientSecret ?? undefined,
        sessionId: response.sessionId ?? undefined,
        loading: false,
      }));
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to create checkout session";
      setState({
        currentStage: "error",
        error: errorMessage,
        loading: false,
      });
      onError?.(errorMessage);
    }
  }, [
    selectedPlan,
    installationId,
    minimumSeats,
    serverQuantity,
    createSession,
    setState,
    setInstallationId,
    setCurrentLicenseKey,
    onError,
  ]);

  const handlePaymentComplete = useCallback(async () => {
    // Preserve state when changing stage
    setState((prev) => ({ ...prev, currentStage: "success" }));

    // Check if this is an upgrade (existing license key) or new plan
    if (currentLicenseKey) {
      // UPGRADE FLOW: Resync existing license with Keygen
      console.log("Upgrade detected - resyncing existing license with Keygen");
      setPollingStatus("polling");

      const activation = await resyncExistingLicense({
        isMounted: () => true, // Modal is open, no need to check
        onActivated: onLicenseActivated,
      });

      if (activation.success) {
        console.log(`License upgraded successfully: ${activation.licenseType}`);
        setPollingStatus("ready");
      } else {
        console.error("Failed to sync upgraded license:", activation.error);
        setPollingStatus("timeout");
      }

      // Notify parent (don't wait - upgrade is complete)
      onSuccess?.(state.sessionId || "");
    } else {
      // NEW PLAN FLOW: Poll for new license key
      console.log("New subscription - polling for license key");

      if (installationId) {
        pollForLicenseKey(installationId).finally(() => {
          // Only notify parent after polling completes or times out
          onSuccess?.(state.sessionId || "");
        });
      } else {
        // No installation ID, notify immediately
        onSuccess?.(state.sessionId || "");
      }
    }
  }, [
    currentLicenseKey,
    installationId,
    state.sessionId,
    setState,
    setPollingStatus,
    pollForLicenseKey,
    onSuccess,
    onLicenseActivated,
  ]);

  return {
    createCheckoutSession,
    handlePaymentComplete,
  };
};
