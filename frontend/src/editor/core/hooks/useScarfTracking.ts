import { useEffect } from "react";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useCookieConsent } from "@editor/hooks/useCookieConsent";
import { setScarfConfig, firePixel } from "@editor/utils/scarfTracking";

/**
 * Hook for initializing Scarf tracking
 *
 * This hook should be mounted once during app initialization (e.g., in index.tsx).
 * It configures the scarf tracking utility with current config and consent state,
 * and sets up event listeners to auto-fire pixels when consent is granted.
 *
 * After initialization, firePixel() can be called from anywhere in the app,
 * including non-React utility functions like urlRouting.ts.
 */
export function useScarfTracking() {
  const { config } = useAppConfig();
  const { isServiceAccepted } = useCookieConsent({
    analyticsEnabled: config?.enableAnalytics === true,
  });

  // Update scarf config whenever config or consent changes
  useEffect(() => {
    if (config && config.enableScarf !== undefined) {
      setScarfConfig(config.enableScarf, isServiceAccepted);
    }
  }, [config?.enableScarf, isServiceAccepted]);

  // Listen to cookie consent changes and auto-fire pixel when consent is granted
  useEffect(() => {
    const handleConsentChange = () => {
      if (isServiceAccepted("scarf", "analytics")) {
        firePixel(window.location.pathname);
      }
    };

    window.addEventListener("cc:onConsent", handleConsentChange);
    window.addEventListener("cc:onChange", handleConsentChange);

    return () => {
      window.removeEventListener("cc:onConsent", handleConsentChange);
      window.removeEventListener("cc:onChange", handleConsentChange);
    };
  }, [isServiceAccepted]);
}
