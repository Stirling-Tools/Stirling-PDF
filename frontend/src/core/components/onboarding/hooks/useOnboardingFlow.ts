import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useCookieConsentContext } from '@app/contexts/CookieConsentContext';
import { useOnboarding } from '@app/contexts/OnboardingContext';
import { useAuth } from '@app/auth/UseSession';
import type { LicenseNotice } from '@app/components/onboarding/slides/types';

interface InitialModalHandlers {
  opened: boolean;
  onLicenseNoticeUpdate: (notice: LicenseNotice) => void;
  onRequestServerLicense: (options?: { deferUntilTourComplete?: boolean; selfReportedAdmin?: boolean }) => void;
  onClose: () => void;
}

interface ServerLicenseModalHandlers {
  opened: boolean;
  licenseNotice: LicenseNotice;
  onClose: () => void;
}

export function useOnboardingFlow() {
  const { preferences, updatePreference } = usePreferences();
  const { config } = useAppConfig();
  const { showCookieConsent, isReady: isCookieConsentReady } = useCookieConsentContext();
  const { completeTour, tourType, isOpen } = useOnboarding();
  let session: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    session = useAuth()?.session ?? null;
  } catch {
    session = {} as any;
  }

  const loginEnabled = !!config?.enableLogin;
  const isAuthenticated = !!session;
  const shouldShowIntro = !preferences.hasSeenIntroOnboarding && (!loginEnabled || isAuthenticated);
  const isAdminUser = !!config?.isAdmin;

  const [licenseNotice, setLicenseNotice] = useState<LicenseNotice>({
    totalUsers: null,
    freeTierLimit: 5,
    isOverLimit: false,
  });
  const [cookieBannerPending, setCookieBannerPending] = useState(false);
  const [serverLicenseIntent, setServerLicenseIntent] = useState<'idle' | 'pending' | 'deferred'>('idle');
  const [serverLicenseSource, setServerLicenseSource] = useState<'config' | 'self-reported' | null>(null);
  const [isServerLicenseOpen, setIsServerLicenseOpen] = useState(false);
  const [hasShownServerLicense, setHasShownServerLicense] = useState(false);
  const [toolPromptCompleted, setToolPromptCompleted] = useState(
    preferences.toolPanelModePromptSeen || preferences.hasSelectedToolPanelMode,
  );
  const introWasOpenRef = useRef(false);

  const handleInitialModalClose = useCallback(() => {
    if (!preferences.hasSeenIntroOnboarding) {
      updatePreference('hasSeenIntroOnboarding', true);
    }
  }, [preferences.hasSeenIntroOnboarding, updatePreference]);

  const handleLicenseNoticeUpdate = useCallback((notice: LicenseNotice) => {
    setLicenseNotice(notice);
  }, []);

  const handleToolPromptComplete = useCallback(() => {
    setToolPromptCompleted(true);
  }, []);

  const maybeShowCookieBanner = useCallback(() => {
    if (preferences.hasSeenCookieBanner) {
      return;
    }

    if (!isCookieConsentReady || isServerLicenseOpen || serverLicenseIntent !== 'idle' || !toolPromptCompleted) {
      setCookieBannerPending(true);
      return;
    }

    setCookieBannerPending(false);
    showCookieConsent();
    updatePreference('hasSeenCookieBanner', true);
  }, [
    isCookieConsentReady,
    isServerLicenseOpen,
    preferences.hasSeenCookieBanner,
    serverLicenseIntent,
    showCookieConsent,
    toolPromptCompleted,
    updatePreference,
  ]);

  const requestServerLicense = useCallback(
    ({
      deferUntilTourComplete = false,
      selfReportedAdmin = false,
    }: { deferUntilTourComplete?: boolean; selfReportedAdmin?: boolean } = {}) => {
      const qualifies = isAdminUser || selfReportedAdmin;
      if (!qualifies) {
        return;
      }
      setServerLicenseSource(isAdminUser ? 'config' : 'self-reported');
      setServerLicenseIntent((prev) => {
        if (prev === 'pending') {
          return prev;
        }
        if (prev === 'deferred') {
          return deferUntilTourComplete ? prev : 'pending';
        }
        if (prev === 'idle') {
          return deferUntilTourComplete ? 'deferred' : 'pending';
        }
        return prev;
      });
    },
    [isAdminUser],
  );

  useEffect(() => {
    if (
      cookieBannerPending &&
      isCookieConsentReady &&
      serverLicenseIntent === 'idle' &&
      !isServerLicenseOpen &&
      toolPromptCompleted
    ) {
      maybeShowCookieBanner();
    }
  }, [
    cookieBannerPending,
    isCookieConsentReady,
    isServerLicenseOpen,
    serverLicenseIntent,
    toolPromptCompleted,
    maybeShowCookieBanner,
  ]);

  useEffect(() => {
    const isEligibleAdmin = isAdminUser || serverLicenseSource === 'self-reported';
    if (
      introWasOpenRef.current &&
      !shouldShowIntro &&
      isEligibleAdmin &&
      toolPromptCompleted &&
      !hasShownServerLicense &&
      serverLicenseIntent === 'idle'
    ) {
      setServerLicenseIntent('pending');
    }
    introWasOpenRef.current = shouldShowIntro;
  }, [
    hasShownServerLicense,
    isAdminUser,
    serverLicenseIntent,
    shouldShowIntro,
    serverLicenseSource,
    toolPromptCompleted,
  ]);

  useEffect(() => {
    const isEligibleAdmin = isAdminUser || serverLicenseSource === 'self-reported';
    if (
      serverLicenseIntent !== 'idle' &&
      !shouldShowIntro &&
      !isOpen &&
      !isServerLicenseOpen &&
      isEligibleAdmin &&
      toolPromptCompleted
    ) {
      setIsServerLicenseOpen(true);
      setServerLicenseIntent(serverLicenseIntent === 'deferred' ? 'pending' : 'idle');
    }
  }, [
    isAdminUser,
    isOpen,
    isServerLicenseOpen,
    serverLicenseIntent,
    shouldShowIntro,
    serverLicenseSource,
    toolPromptCompleted,
  ]);

  const handleServerLicenseClose = useCallback(() => {
    setIsServerLicenseOpen(false);
    setHasShownServerLicense(true);
    setServerLicenseIntent('idle');
    setServerLicenseSource(null);
    maybeShowCookieBanner();
  }, [maybeShowCookieBanner]);

  const handleTourCompletion = useCallback(() => {
    completeTour();
    if (serverLicenseIntent === 'deferred') {
      setServerLicenseIntent('pending');
    } else if (tourType === 'admin' && (isAdminUser || serverLicenseSource === 'self-reported')) {
      setServerLicenseSource((prev) => prev ?? (isAdminUser ? 'config' : 'self-reported'));
      setServerLicenseIntent((prev) => (prev === 'pending' ? prev : 'pending'));
    }
    maybeShowCookieBanner();
  }, [
    completeTour,
    isAdminUser,
    maybeShowCookieBanner,
    serverLicenseIntent,
    serverLicenseSource,
    tourType,
  ]);

  const initialModalProps: InitialModalHandlers = useMemo(
    () => ({
      opened: shouldShowIntro,
      onLicenseNoticeUpdate: handleLicenseNoticeUpdate,
      onRequestServerLicense: requestServerLicense,
      onClose: handleInitialModalClose,
    }),
    [handleInitialModalClose, handleLicenseNoticeUpdate, requestServerLicense, shouldShowIntro],
  );

  const serverLicenseModalProps: ServerLicenseModalHandlers = useMemo(
    () => ({
      opened: isServerLicenseOpen,
      licenseNotice,
      onClose: handleServerLicenseClose,
    }),
    [handleServerLicenseClose, isServerLicenseOpen, licenseNotice],
  );

  return {
    tourType,
    isTourOpen: isOpen,
    maskClassName: tourType === 'admin' ? 'admin-tour-mask' : undefined,
    initialModalProps,
    handleToolPromptComplete,
    serverLicenseModalProps,
    handleTourCompletion,
  };
}

