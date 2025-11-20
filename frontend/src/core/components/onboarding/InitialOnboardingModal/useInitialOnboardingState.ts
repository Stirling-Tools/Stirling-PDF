import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useOnboarding } from '@app/contexts/OnboardingContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useOs } from '@app/hooks/useOs';
import { useNavigate } from 'react-router-dom';
import {
  SLIDE_DEFINITIONS,
  type ButtonAction,
  type FlowState,
  type SlideId,
} from '@app/components/onboarding/onboardingFlowConfig';
import type { LicenseNotice } from '@app/components/onboarding/slides/types';
import { resolveFlow } from './flowResolver';
import { useLicenseInfo } from './useLicenseInfo';
import { useDevScenarios } from './useDevScenarios';
import { DEFAULT_STATE, type InitialOnboardingModalProps, type OnboardingState } from './types';

const FREE_TIER_LIMIT = 5;

interface UseInitialOnboardingStateResult {
  state: OnboardingState;
  totalSteps: number;
  slideDefinition: (typeof SLIDE_DEFINITIONS)[SlideId];
  currentSlide: ReturnType<(typeof SLIDE_DEFINITIONS)[SlideId]['createSlide']>;
  licenseNotice: LicenseNotice;
  flowState: FlowState;
  closeAndMarkSeen: () => void;
  handleButtonAction: (action: ButtonAction) => void;
  handleDownloadIconSelect: (icon: 'new' | 'classic') => void;
  devButtons: ReturnType<typeof useDevScenarios>['devButtons'];
  activeDevScenario: ReturnType<typeof useDevScenarios>['activeDevScenario'];
  handleDevScenarioClick: ReturnType<typeof useDevScenarios>['handleDevScenarioClick'];
}

export function useInitialOnboardingState({
  opened,
  onClose,
  onRequestServerLicense,
  onLicenseNoticeUpdate,
}: InitialOnboardingModalProps): UseInitialOnboardingStateResult | null {
  const { preferences, updatePreference } = usePreferences();
  const { startTour } = useOnboarding();
  const { config } = useAppConfig();
  const osType = useOs();
  const navigate = useNavigate();
  const isDevMode = import.meta.env.MODE === 'development';

  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);

  const resetState = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  useEffect(() => {
    if (!opened) {
      resetState();
    }
  }, [opened, resetState]);

  const handleRoleSelect = useCallback((role: 'admin' | 'user' | null) => {
    setState((prev) => ({
      ...prev,
      selectedRole: role,
      selfReportedAdmin: role === 'admin',
    }));

    if (role === 'admin') {
      window?.localStorage?.setItem('stirling-self-reported-admin', 'true');
    }
  }, []);

  const closeAndMarkSeen = useCallback(() => {
    if (!preferences.hasSeenIntroOnboarding) {
      updatePreference('hasSeenIntroOnboarding', true);
    }
    onClose();
  }, [onClose, preferences.hasSeenIntroOnboarding, updatePreference]);

  const handleDevScenarioApply = useCallback(
    ({
      selectedRole,
      selfReportedAdmin,
    }: {
      selectedRole: 'admin' | 'user' | null;
      selfReportedAdmin: boolean;
    }) => {
      setState({
        ...DEFAULT_STATE,
        selectedRole,
        selfReportedAdmin,
      });
    },
    [],
  );

  const { devButtons, activeDevScenario, handleDevScenarioClick, devOverrides } = useDevScenarios({
    opened,
    isDevMode,
    onApplyScenario: handleDevScenarioApply,
  });

  const isAdmin = !!config?.isAdmin;
  const enableLogin = config?.enableLogin ?? true;

  const effectiveEnableLogin = devOverrides?.enableLogin ?? enableLogin;
  const effectiveIsAdmin = devOverrides?.isAdmin ?? isAdmin;

  const licenseUserCountFromApi = useLicenseInfo({
    opened,
    shouldFetch: effectiveEnableLogin && effectiveIsAdmin && !devOverrides,
  });

  const effectiveLicenseUserCount =
    devOverrides?.licenseUserCount ?? licenseUserCountFromApi ?? null;

  const os = useMemo(() => {
    switch (osType) {
      case 'windows':
        return { label: 'Windows', url: 'https://files.stirlingpdf.com/win-installer.exe' };
      case 'mac-apple':
        return { label: 'Mac', url: 'https://files.stirlingpdf.com/mac-installer.dmg' };
      case 'mac-intel':
        return { label: 'Mac (Intel)', url: 'https://files.stirlingpdf.com/mac-x86_64-installer.dmg' };
      case 'linux-x64':
      case 'linux-arm64':
        return { label: 'Linux', url: 'https://docs.stirlingpdf.com/Installation/Unix%20Installation/' };
      default:
        return { label: '', url: '' };
    }
  }, [osType]);

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

  const licenseNotice = useMemo<LicenseNotice>(
    () => ({
      totalUsers: effectiveLicenseUserCount,
      freeTierLimit: FREE_TIER_LIMIT,
      isOverLimit:
        effectiveLicenseUserCount != null && effectiveLicenseUserCount > FREE_TIER_LIMIT,
    }),
    [effectiveLicenseUserCount],
  );

  useEffect(() => {
    onLicenseNoticeUpdate?.(licenseNotice);
  }, [licenseNotice, onLicenseNoticeUpdate]);

  const currentSlide = slideDefinition.createSlide({
    osLabel: os.label,
    osUrl: os.url,
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
          const downloadUrl =
            state.selectedDownloadIcon === 'new'
              ? os.url
              : state.selectedDownloadIcon === 'classic'
              ? os.url
              : currentSlide.downloadUrl;
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
          onRequestServerLicense?.({
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
            onRequestServerLicense?.({
              deferUntilTourComplete: true,
              selfReportedAdmin: state.selfReportedAdmin || effectiveIsAdmin,
            });
          }
          launchTour(launchMode, { closeOnboardingSlides: true });
          return;
        }
        case 'skip-to-license':
          updatePreference('hasCompletedOnboarding', true);
          onRequestServerLicense?.({
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
      onRequestServerLicense,
      os.url,
      state.selectedDownloadIcon,
      state.selectedRole,
      state.selfReportedAdmin,
      updatePreference,
    ],
  );

  const handleDownloadIconSelect = useCallback((icon: 'new' | 'classic') => {
    setState((prev) => ({
      ...prev,
      selectedDownloadIcon: icon,
    }));
  }, []);

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
    handleDownloadIconSelect,
    devButtons,
    activeDevScenario,
    handleDevScenarioClick,
  };
}

