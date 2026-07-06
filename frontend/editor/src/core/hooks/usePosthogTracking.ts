import { useEffect } from "react";
import posthog from "posthog-js";
import { useAppConfig } from "@app/contexts/AppConfigContext";

function applyPosthogConsent(): void {
  if (typeof window === "undefined" || !posthog.__loaded) {
    return;
  }

  const optedIn =
    window.CookieConsent?.acceptedService?.("posthog", "analytics") || false;

  if (optedIn) {
    posthog.set_config({ persistence: "localStorage+cookie" });
    posthog.opt_in_capturing();
    return;
  }

  posthog.opt_out_capturing();
  posthog.set_config({ persistence: "memory" });
}

function ensurePosthogInitialized(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

  if (!posthogKey || !posthogHost) {
    return false;
  }

  if (!posthog.__loaded) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      defaults: "2025-05-24",
      capture_exceptions: true,
      debug: false,
      opt_out_capturing_by_default: true,
      persistence: "memory",
      cross_subdomain_cookie: false,
    });
  }

  return true;
}

export function usePosthogTracking(): void {
  const { config } = useAppConfig();

  useEffect(() => {
    const analyticsEnabled = config?.enableAnalytics === true;
    const posthogEnabled = analyticsEnabled && config?.enablePosthog !== false;

    if (!posthogEnabled) {
      if (posthog.__loaded) {
        posthog.opt_out_capturing();
        posthog.set_config({ persistence: "memory" });
      }
      return;
    }

    if (!ensurePosthogInitialized()) {
      return;
    }

    applyPosthogConsent();

    const handleConsentChange = () => {
      applyPosthogConsent();
    };

    window.addEventListener("cc:onConsent", handleConsentChange);
    window.addEventListener("cc:onChange", handleConsentChange);

    return () => {
      window.removeEventListener("cc:onConsent", handleConsentChange);
      window.removeEventListener("cc:onChange", handleConsentChange);
    };
  }, [config?.enableAnalytics, config?.enablePosthog]);
}
