import { useCallback } from "react";

declare global {
  interface Window {
    CookieConsent?: {
      run: (config: Record<string, unknown>) => void;
      show: (show?: boolean) => void;
      hide: () => void;
      showPreferences: () => void;
      hidePreferences: () => void;
      getCookie: (name?: string) => unknown;
      acceptedCategory: (category: string) => boolean;
      acceptedService: (serviceName: string, category: string) => boolean;
    };
  }
}

/** Reads consent and opens preferences; StartupPrompts owns library initialization. */
export function useCookieConsent() {
  const showCookieConsent = useCallback(() => {
    window.CookieConsent?.show();
  }, []);

  const showCookiePreferences = useCallback(() => {
    window.CookieConsent?.showPreferences();
  }, []);

  const isServiceAccepted = useCallback(
    (service: string, category: string): boolean => {
      return window.CookieConsent?.acceptedService(service, category) ?? false;
    },
    [],
  );

  return { showCookieConsent, showCookiePreferences, isServiceAccepted };
}
