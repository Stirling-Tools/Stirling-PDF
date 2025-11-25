import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useCookieConsentContext } from '@app/contexts/CookieConsentContext';
import { useOnboarding } from '@app/contexts/OnboardingContext';
import type { LicenseNotice } from '@app/types/types';
import { useNavigate } from 'react-router-dom';
import {
  ONBOARDING_SESSION_BLOCK_KEY,
  ONBOARDING_SESSION_EVENT,
  SERVER_LICENSE_REQUEST_EVENT,
  type ServerLicenseRequestPayload,
} from '@app/constants/events';
import { useServerExperience } from '@app/hooks/useServerExperience';

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
  onSeePlans: () => void;
}

export function useOnboardingFlow() {
  const { preferences, updatePreference } = usePreferences();
  const { config } = useAppConfig();
  const { showCookieConsent, isReady: isCookieConsentReady } = useCookieConsentContext();
  const { completeTour, tourType, isOpen } = useOnboarding();
  
  const shouldShowIntro = !preferences.hasSeenIntroOnboarding;
  const isAdminUser = !!config?.isAdmin;
  const { hasPaidLicense } = useServerExperience();

  const [licenseNotice, setLicenseNotice] = useState<LicenseNotice>({
    totalUsers: null,
    freeTierLimit: 5,
    isOverLimit: false,
    requiresLicense: false,
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
  const navigate = useNavigate();
  const onboardingSessionMarkedRef = useRef(false);

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
      if (hasPaidLicense || !licenseNotice.requiresLicense) {
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
    [hasPaidLicense, isAdminUser, licenseNotice.requiresLicense],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleServerLicenseRequested = (event: Event) => {
      const { detail } = event as CustomEvent<ServerLicenseRequestPayload>;

      if (detail?.licenseNotice) {
        setLicenseNotice((prev) => ({
          ...prev,
          ...detail.licenseNotice,
          totalUsers:
            detail.licenseNotice?.totalUsers ?? prev.totalUsers,
          freeTierLimit:
            detail.licenseNotice?.freeTierLimit ?? prev.freeTierLimit,
          isOverLimit:
            detail.licenseNotice?.isOverLimit ?? prev.isOverLimit,
          requiresLicense:
            detail.licenseNotice?.requiresLicense ?? prev.requiresLicense,
        }));
      }

      requestServerLicense({
        deferUntilTourComplete: detail?.deferUntilTourComplete ?? false,
        selfReportedAdmin: detail?.selfReportedAdmin ?? false,
      });
    };

    window.addEventListener(
      SERVER_LICENSE_REQUEST_EVENT,
      handleServerLicenseRequested as EventListener,
    );

    return () => {
      window.removeEventListener(
        SERVER_LICENSE_REQUEST_EVENT,
        handleServerLicenseRequested as EventListener,
      );
    };
  }, [requestServerLicense]);

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
    const isEligibleAdmin =
      isAdminUser || serverLicenseSource === 'self-reported' || licenseNotice.requiresLicense;
    if (
      introWasOpenRef.current &&
      !shouldShowIntro &&
      isEligibleAdmin &&
      toolPromptCompleted &&
      !hasShownServerLicense &&
      licenseNotice.requiresLicense &&
      serverLicenseIntent === 'idle'
    ) {
      if (!serverLicenseSource) {
        setServerLicenseSource(isAdminUser ? 'config' : 'self-reported');
      }
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
    licenseNotice.requiresLicense,
  ]);

  useEffect(() => {
    const isEligibleAdmin =
      isAdminUser || serverLicenseSource === 'self-reported' || licenseNotice.requiresLicense;
    if (
      serverLicenseIntent !== 'idle' &&
      !shouldShowIntro &&
      !isOpen &&
      !isServerLicenseOpen &&
      isEligibleAdmin &&
      toolPromptCompleted &&
      licenseNotice.requiresLicense
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
    licenseNotice.requiresLicense,
  ]);

  const handleServerLicenseClose = useCallback(() => {
    setIsServerLicenseOpen(false);
    setHasShownServerLicense(true);
    setServerLicenseIntent('idle');
    setServerLicenseSource(null);
    maybeShowCookieBanner();
  }, [maybeShowCookieBanner]);

  useEffect(() => {
    if (onboardingSessionMarkedRef.current) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    if (shouldShowIntro || isOpen) {
      onboardingSessionMarkedRef.current = true;
      window.sessionStorage.setItem(ONBOARDING_SESSION_BLOCK_KEY, 'true');
      window.dispatchEvent(new CustomEvent(ONBOARDING_SESSION_EVENT));
    }
  }, [isOpen, shouldShowIntro]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!shouldShowIntro && !isOpen) {
      window.sessionStorage.removeItem(ONBOARDING_SESSION_BLOCK_KEY);
      window.dispatchEvent(new CustomEvent(ONBOARDING_SESSION_EVENT));
    }
  }, [isOpen, shouldShowIntro]);

  const handleServerLicenseSeePlans = useCallback(() => {
    handleServerLicenseClose();
    navigate('/settings/adminPlan');
  }, [handleServerLicenseClose, navigate]);

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
      onSeePlans: handleServerLicenseSeePlans,
    }),
    [handleServerLicenseClose, handleServerLicenseSeePlans, isServerLicenseOpen, licenseNotice],
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

