import { useEffect } from "react";
import type { PostHog } from "posthog-js";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { loadPosthog, loadedPosthog } from "@app/services/analytics";

function applyPosthogConsent(posthog: PostHog): void {
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

function posthogCredentials(): { key: string; host: string } | null {
  if (typeof window === "undefined") {
    return null;
  }

  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
  return key && host ? { key, host } : null;
}

/**
 * Starts PostHog once the server enables analytics, and only then loads it: a
 * session with analytics off never downloads the library at all.
 */
export function usePosthogTracking(): void {
  const { config } = useAppConfig();

  useEffect(() => {
    const analyticsEnabled = config?.enableAnalytics === true;
    const posthogEnabled = analyticsEnabled && config?.enablePosthog !== false;

    if (!posthogEnabled) {
      // Switched off after running: stop capturing. Never loaded: nothing to stop.
      const posthog = loadedPosthog();
      if (posthog?.__loaded) {
        posthog.opt_out_capturing();
        posthog.set_config({ persistence: "memory" });
      }
      return;
    }

    const credentials = posthogCredentials();
    if (!credentials) {
      return;
    }

    let cancelled = false;
    let detach = () => {};
    void loadPosthog().then((posthog) => {
      if (cancelled) return;
      if (!posthog.__loaded) {
        posthog.init(credentials.key, {
          api_host: credentials.host,
          defaults: "2025-05-24",
          capture_exceptions: true,
          debug: false,
          opt_out_capturing_by_default: true,
          persistence: "memory",
          cross_subdomain_cookie: false,
        });
      }

      applyPosthogConsent(posthog);

      const handleConsentChange = () => {
        applyPosthogConsent(posthog);
      };
      window.addEventListener("cc:onConsent", handleConsentChange);
      window.addEventListener("cc:onChange", handleConsentChange);
      detach = () => {
        window.removeEventListener("cc:onConsent", handleConsentChange);
        window.removeEventListener("cc:onChange", handleConsentChange);
      };
    });

    return () => {
      cancelled = true;
      detach();
    };
  }, [config?.enableAnalytics, config?.enablePosthog]);
}
