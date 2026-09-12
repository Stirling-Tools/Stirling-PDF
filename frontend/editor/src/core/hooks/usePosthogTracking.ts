import { useEffect } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { loadPosthog } from "@app/services/posthogLoader";
import type { PosthogClient } from "@app/services/posthogLoader";

function applyPosthogConsent(ph: PosthogClient): void {
  if (typeof window === "undefined" || !ph.__loaded) {
    return;
  }

  const optedIn =
    window.CookieConsent?.acceptedService?.("posthog", "analytics") || false;

  if (optedIn) {
    ph.set_config({ persistence: "localStorage+cookie" });
    ph.opt_in_capturing();
    return;
  }

  ph.opt_out_capturing();
  ph.set_config({ persistence: "memory" });
}

function ensurePosthogInitialized(ph: PosthogClient): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

  if (!posthogKey || !posthogHost) {
    return false;
  }

  if (!ph.__loaded) {
    ph.init(posthogKey, {
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

    // Analytics disabled: never load the module at all.
    if (!posthogEnabled) {
      return;
    }

    let cancelled = false;
    let removeConsentListeners: (() => void) | undefined;

    void (async () => {
      const ph = await loadPosthog();
      if (cancelled || !ph) {
        return;
      }
      if (!ensurePosthogInitialized(ph)) {
        return;
      }

      applyPosthogConsent(ph);

      const handleConsentChange = () => {
        applyPosthogConsent(ph);
      };

      window.addEventListener("cc:onConsent", handleConsentChange);
      window.addEventListener("cc:onChange", handleConsentChange);
      removeConsentListeners = () => {
        window.removeEventListener("cc:onConsent", handleConsentChange);
        window.removeEventListener("cc:onChange", handleConsentChange);
      };
    })();

    return () => {
      cancelled = true;
      removeConsentListeners?.();
    };
  }, [config?.enableAnalytics, config?.enablePosthog]);
}
