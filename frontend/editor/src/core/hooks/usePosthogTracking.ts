import { useEffect } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";

// posthog-js is ~230 KB and only matters when analytics is on, so it loads on
// demand instead of riding the startup chunk. The module is cached across
// mounts; `activePosthog` records that it has been loaded this session.
type Posthog = typeof import("posthog-js").default;

let posthogPromise: Promise<Posthog> | null = null;
let activePosthog: Posthog | null = null;

function loadPosthog(): Promise<Posthog> {
  posthogPromise ??= import("posthog-js").then((mod) => mod.default);
  return posthogPromise;
}

function applyPosthogConsent(posthog: Posthog): void {
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

function posthogConfig(): { key: string; host: string } | null {
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return null;
  return { key, host };
}

function initializePosthog(posthog: Posthog, key: string, host: string): void {
  if (posthog.__loaded) return;
  posthog.init(key, {
    api_host: host,
    defaults: "2025-05-24",
    capture_exceptions: true,
    debug: false,
    opt_out_capturing_by_default: true,
    persistence: "memory",
    cross_subdomain_cookie: false,
  });
}

export function usePosthogTracking(): void {
  const { config } = useAppConfig();

  useEffect(() => {
    const analyticsEnabled = config?.enableAnalytics === true;
    const posthogEnabled = analyticsEnabled && config?.enablePosthog !== false;

    if (!posthogEnabled) {
      // Nothing loaded means nothing to opt out of; loading the module to do
      // so would defeat the deferral.
      if (activePosthog) {
        activePosthog.opt_out_capturing();
        activePosthog.set_config({ persistence: "memory" });
      }
      return;
    }

    const credentials = posthogConfig();
    if (!credentials) {
      return;
    }

    let cancelled = false;
    let handleConsentChange: (() => void) | null = null;

    void (async () => {
      const posthog = await loadPosthog();
      if (cancelled) return;
      activePosthog = posthog;

      initializePosthog(posthog, credentials.key, credentials.host);
      applyPosthogConsent(posthog);

      handleConsentChange = () => {
        applyPosthogConsent(posthog);
      };
      window.addEventListener("cc:onConsent", handleConsentChange);
      window.addEventListener("cc:onChange", handleConsentChange);
    })();

    return () => {
      cancelled = true;
      if (handleConsentChange) {
        window.removeEventListener("cc:onConsent", handleConsentChange);
        window.removeEventListener("cc:onChange", handleConsentChange);
      }
    };
  }, [config?.enableAnalytics, config?.enablePosthog]);
}
