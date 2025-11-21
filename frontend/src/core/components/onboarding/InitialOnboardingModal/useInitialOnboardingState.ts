import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useOnboarding } from '@app/contexts/OnboardingContext';
import { useOs } from '@app/hooks/useOs';
import { useNavigate } from 'react-router-dom';
import {
  SLIDE_DEFINITIONS,
  type ButtonAction,
  type FlowState,
  type SlideId,
} from '@app/components/onboarding/onboardingFlowConfig';
import type { LicenseNotice } from '@app/types/types';
import { resolveFlow } from './flowResolver';
import { useServerExperience } from '@app/hooks/useServerExperience';
import { DEFAULT_STATE, type InitialOnboardingModalProps, type OnboardingState } from './types';

interface UseInitialOnboardingStateResult {
  state: OnboardingState;
  totalSteps: number;
  slideDefinition: (typeof SLIDE_DEFINITIONS)[SlideId];
  currentSlide: ReturnType<(typeof SLIDE_DEFINITIONS)[SlideId]['createSlide']>;
  licenseNotice: LicenseNotice;
  flowState: FlowState;
  closeAndMarkSeen: () => void;
  handleButtonAction: (action: ButtonAction) => void;
}

export function useInitialOnboardingState({
  opened,
  onClose,
  onRequestServerLicense,
  onLicenseNoticeUpdate,
}: InitialOnboardingModalProps): UseInitialOnboardingStateResult | null {
  const { preferences, updatePreference } = usePreferences();
  const { startTour } = useOnboarding();
  const {
    loginEnabled: loginEnabledFromServer,
    configIsAdmin,
    totalUsers: serverTotalUsers,
    userCountResolved: serverUserCountResolved,
    freeTierLimit,
    hasPaidLicense,
    scenarioKey,
    setSelfReportedAdmin,
  } = useServerExperience();
  const osType = useOs();
  const navigate = useNavigate();
  const selectedDownloadUrlRef = useRef<string>('');

  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);

  const resetState = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  useEffect(() => {
    if (!opened) {
      resetState();
    }
  }, [opened, resetState]);

  const handleRoleSelect = useCallback(
    (role: 'admin' | 'user' | null) => {
      const isAdminSelection = role === 'admin';
      setState((prev) => ({
        ...prev,
        selectedRole: role,
        selfReportedAdmin: isAdminSelection,
      }));

      if (typeof window !== 'undefined') {
        if (isAdminSelection) {
          window.localStorage.setItem('stirling-self-reported-admin', 'true');
        } else {
          window.localStorage.removeItem('stirling-self-reported-admin');
        }
      }

      setSelfReportedAdmin(isAdminSelection);
    },
    [setSelfReportedAdmin],
  );

  const closeAndMarkSeen = useCallback(() => {
    if (!preferences.hasSeenIntroOnboarding) {
      updatePreference('hasSeenIntroOnboarding', true);
    }
    onClose();
  }, [onClose, preferences.hasSeenIntroOnboarding, updatePreference]);

  const isAdmin = configIsAdmin;
  const enableLogin = loginEnabledFromServer;

  const effectiveEnableLogin = enableLogin;
  const effectiveIsAdmin = isAdmin;

  const shouldUseServerCount =
    (effectiveEnableLogin && effectiveIsAdmin) || !effectiveEnableLogin;
  const licenseUserCountFromServer =
    shouldUseServerCount && serverUserCountResolved ? serverTotalUsers : null;

  const effectiveLicenseUserCount = licenseUserCountFromServer ?? null;

  const os = useMemo(() => {
    switch (osType) {
      case 'windows':
        return { label: 'Windows', url: 'https://files.stirlingpdf.com/win-installer.exe' };
      case 'mac-apple':
        return { label: 'Mac (Apple Silicon)', url: 'https://files.stirlingpdf.com/mac-installer.dmg' };
      case 'mac-intel':
        return { label: 'Mac (Intel)', url: 'https://files.stirlingpdf.com/mac-x86_64-installer.dmg' };
      case 'linux-x64':
      case 'linux-arm64':
        return { label: 'Linux', url: 'https://docs.stirlingpdf.com/Installation/Unix%20Installation/' };
      default:
        return { label: '', url: '' };
    }
  }, [osType]);

  const osOptions = useMemo(() => {
    const options = [
      { label: 'Windows', url: 'https://files.stirlingpdf.com/win-installer.exe', value: 'windows' },
      { label: 'Mac (Apple Silicon)', url: 'https://files.stirlingpdf.com/mac-installer.dmg', value: 'mac-apple' },
      { label: 'Mac (Intel)', url: 'https://files.stirlingpdf.com/mac-x86_64-installer.dmg', value: 'mac-intel' },
      { label: 'Linux', url: 'https://docs.stirlingpdf.com/Installation/Unix%20Installation/', value: 'linux' },
    ];
    return options.filter(opt => opt.url);
  }, []);

  const { ids: flowSlideIds, type: flowType } = resolveFlow(
    effectiveEnableLogin,
    effectiveIsAdmin,
    state.selfReportedAdmin,
  );
  const totalSteps = flowSlideIds.length;
  const maxIndex = Math.max(totalSteps - 1, 0);

  useEffect(() => {
    if (state.step >= flowSlideIds.length) {
      setState((prev) => ({
        ...prev,
        step: Math.max(flowSlideIds.length - 1, 0),
      }));
    }
  }, [flowSlideIds.length, state.step]);

  const currentSlideId = flowSlideIds[state.step] ?? flowSlideIds[flowSlideIds.length - 1];
  const slideDefinition = SLIDE_DEFINITIONS[currentSlideId];

  if (!slideDefinition) {
    return null;
  }

  const scenarioProvidesInfo =
    scenarioKey && scenarioKey !== 'unknown' && scenarioKey !== 'licensed';
  const scenarioIndicatesAdmin = scenarioProvidesInfo
    ? scenarioKey!.includes('admin')
    : state.selfReportedAdmin || effectiveIsAdmin;
  const scenarioIndicatesOverLimit = scenarioProvidesInfo
    ? scenarioKey!.includes('over-limit')
    : effectiveLicenseUserCount != null && effectiveLicenseUserCount > freeTierLimit;
  const scenarioRequiresLicense =
    scenarioKey === 'licensed' ? false : scenarioKey === 'unknown' ? !hasPaidLicense : true;

  const shouldShowServerLicenseInfo = scenarioIndicatesAdmin && scenarioRequiresLicense;

  const licenseNotice = useMemo<LicenseNotice>(
    () => ({
      totalUsers: effectiveLicenseUserCount,
      freeTierLimit,
      isOverLimit: scenarioIndicatesOverLimit,
      requiresLicense: shouldShowServerLicenseInfo,
    }),
    [
      effectiveLicenseUserCount,
      freeTierLimit,
      scenarioIndicatesOverLimit,
      shouldShowServerLicenseInfo,
    ],
  );

  const requestServerLicenseIfNeeded = useCallback(
    (options?: { deferUntilTourComplete?: boolean; selfReportedAdmin?: boolean }) => {
      if (!shouldShowServerLicenseInfo) {
        return;
      }
      onRequestServerLicense?.(options);
    },
    [onRequestServerLicense, shouldShowServerLicenseInfo],
  );

  useEffect(() => {
    onLicenseNoticeUpdate?.(licenseNotice);
  }, [licenseNotice, onLicenseNoticeUpdate]);

  // Initialize ref with default URL
  useEffect(() => {
    if (!selectedDownloadUrlRef.current && os.url) {
      selectedDownloadUrlRef.current = os.url;
    }
  }, [os.url]);

  const handleDownloadUrlChange = useCallback((url: string) => {
    selectedDownloadUrlRef.current = url;
  }, []);

  const currentSlide = slideDefinition.createSlide({
    osLabel: os.label,
    osUrl: os.url,
    osOptions,
    onDownloadUrlChange: handleDownloadUrlChange,
    selectedRole: state.selectedRole,
    onRoleSelect: handleRoleSelect,
    licenseNotice,
  });

  const goNext = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: Math.min(prev.step + 1, maxIndex),
    }));
  }, [maxIndex]);

  const goPrev = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: Math.max(prev.step - 1, 0),
    }));
  }, []);

  const launchTour = useCallback(
    (mode: 'admin' | 'tools', options?: { closeOnboardingSlides?: boolean }) => {
      if (options?.closeOnboardingSlides) {
        closeAndMarkSeen();
      }

      startTour(mode, {
        source: 'initial-onboarding-modal',
        metadata: {
          hasCompletedOnboarding: preferences.hasCompletedOnboarding,
          toolPanelModePromptSeen: preferences.toolPanelModePromptSeen,
          selfReportedAdmin: state.selfReportedAdmin,
        },
      });
    },
    [closeAndMarkSeen, preferences.hasCompletedOnboarding, preferences.toolPanelModePromptSeen, startTour, state.selfReportedAdmin],
  );

  const handleButtonAction = useCallback(
    (action: ButtonAction) => {
      const currentSlideIdLocal = currentSlideId;
      const shouldAutoLaunchLoginUserTour =
        flowType === 'login-user' && currentSlideIdLocal === 'desktop-install';

      switch (action) {
        case 'next':
          if (shouldAutoLaunchLoginUserTour) {
            launchTour('tools', { closeOnboardingSlides: true });
            return;
          }
          goNext();
          return;
        case 'prev':
          goPrev();
          return;
        case 'close':
          closeAndMarkSeen();
          return;
        case 'download-selected': {
          const downloadUrl = selectedDownloadUrlRef.current || os.url || currentSlide.downloadUrl;
          if (downloadUrl) {
            window.open(downloadUrl, '_blank', 'noopener');
          }
          if (shouldAutoLaunchLoginUserTour) {
            launchTour('tools', { closeOnboardingSlides: true });
            return;
          }
          goNext();
          return;
        }
        case 'complete-close':
          updatePreference('hasCompletedOnboarding', true);
          closeAndMarkSeen();
          return;
        case 'security-next':
          if (!state.selectedRole) {
            return;
          }
          if (state.selectedRole === 'admin') {
            goNext();
          } else {
            launchTour('tools', { closeOnboardingSlides: true });
          }
          return;
        case 'launch-admin':
          requestServerLicenseIfNeeded({
            deferUntilTourComplete: true,
            selfReportedAdmin: state.selfReportedAdmin || effectiveIsAdmin,
          });
          launchTour('admin', { closeOnboardingSlides: true });
          return;
        case 'launch-tools':
          launchTour('tools', { closeOnboardingSlides: true });
          return;
        case 'launch-auto': {
          const launchMode = state.selfReportedAdmin || effectiveIsAdmin ? 'admin' : 'tools';
          if (launchMode === 'admin') {
            requestServerLicenseIfNeeded({
              deferUntilTourComplete: true,
              selfReportedAdmin: state.selfReportedAdmin || effectiveIsAdmin,
            });
          }
          launchTour(launchMode, { closeOnboardingSlides: true });
          return;
        }
        case 'skip-to-license':
          updatePreference('hasCompletedOnboarding', true);
          requestServerLicenseIfNeeded({
            deferUntilTourComplete: false,
            selfReportedAdmin: state.selfReportedAdmin || effectiveIsAdmin,
          });
          closeAndMarkSeen();
          return;
        case 'see-plans':
          closeAndMarkSeen();
          navigate('/settings/adminPlan');
          return;
        default:
          return;
      }
    },
    [
      closeAndMarkSeen,
      currentSlide,
      effectiveIsAdmin,
      flowType,
      goNext,
      goPrev,
      launchTour,
      navigate,
      requestServerLicenseIfNeeded,
      onRequestServerLicense,
      os.url,
      state.selectedRole,
      state.selfReportedAdmin,
      updatePreference,
    ],
  );

  const flowState: FlowState = { selectedRole: state.selectedRole };

  return {
    state,
    totalSteps,
    slideDefinition,
    currentSlide,
    licenseNotice,
    flowState,
    closeAndMarkSeen,
    handleButtonAction,
  };
}

