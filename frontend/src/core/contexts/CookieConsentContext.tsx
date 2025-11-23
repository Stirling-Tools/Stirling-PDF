import React, { createContext, useContext, useMemo } from 'react';
import { useCookieConsent } from '@app/hooks/useCookieConsent';
import { useAppConfig } from '@app/contexts/AppConfigContext';

interface CookieConsentContextValue {
  isReady: boolean;
  showCookieConsent: () => void;
  showCookiePreferences: () => void;
  hasResponded: boolean;
}

const CookieConsentContext = createContext<CookieConsentContextValue | undefined>(undefined);

export const CookieConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useAppConfig();
  const analyticsEnabled = config ? config.enableAnalytics !== false : false;
  const {
    showCookieConsent,
    showCookiePreferences,
    isInitialized,
    hasResponded,
  } = useCookieConsent({ analyticsEnabled });

  const value = useMemo<CookieConsentContextValue>(() => ({
    isReady: analyticsEnabled && isInitialized,
    showCookieConsent,
    showCookiePreferences,
    hasResponded,
  }), [analyticsEnabled, hasResponded, isInitialized, showCookieConsent, showCookiePreferences]);

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  );
};

export const useCookieConsentContext = (): CookieConsentContextValue => {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookieConsentContext must be used within a CookieConsentProvider');
  }
  return context;
};

