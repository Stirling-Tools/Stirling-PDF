import { useEffect, useMemo, useCallback, useState } from 'react';
import { type StepType } from '@reactour/tour';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { isAuthRoute } from '@app/constants/routes';
import { dispatchTourState } from '@app/constants/events';
import { useOnboardingOrchestrator } from '@app/components/onboarding/orchestrator/useOnboardingOrchestrator';
import { useBypassOnboarding } from '@app/components/onboarding/useBypassOnboarding';
import OnboardingTour, { type AdvanceArgs, type CloseArgs } from '@app/components/onboarding/OnboardingTour';
import OnboardingModalSlide from '@app/components/onboarding/OnboardingModalSlide';
import {
  useServerLicenseRequest,
  useTourRequest,
} from '@app/components/onboarding/useOnboardingEffects';
import { useOnboardingDownload } from '@app/components/onboarding/useOnboardingDownload';
import { SLIDE_DEFINITIONS, type SlideId, type ButtonAction } from '@app/components/onboarding/onboardingFlowConfig';
import ToolPanelModePrompt from '@app/components/tools/ToolPanelModePrompt';
import { useTourOrchestration } from '@app/contexts/TourOrchestrationContext';
import { useAdminTourOrchestration } from '@app/contexts/AdminTourOrchestrationContext';
import { createUserStepsConfig } from '@app/components/onboarding/userStepsConfig';
import { createAdminStepsConfig } from '@app/components/onboarding/adminStepsConfig';
import { createWhatsNewStepsConfig } from '@app/components/onboarding/whatsNewStepsConfig';
import { removeAllGlows } from '@app/components/onboarding/tourGlow';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useServerExperience } from '@app/hooks/useServerExperience';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import apiClient from '@app/services/apiClient';
import '@app/components/onboarding/OnboardingTour.css';

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const bypassOnboarding = useBypassOnboarding();
  const { state, actions } = useOnboardingOrchestrator();
  const serverExperience = useServerExperience();
  const onAuthRoute = isAuthRoute(location.pathname);
  const { currentStep, isActive, isLoading, runtimeState, activeFlow } = state;

  const { osInfo, osOptions, setSelectedDownloadUrl, handleDownloadSelected } = useOnboardingDownload();
  const { showLicenseSlide, licenseNotice: externalLicenseNotice, closeLicenseSlide } = useServerLicenseRequest();
  const { tourRequested: externalTourRequested, requestedTourType, clearTourRequest } = useTourRequest();
  const { config, refetch: refetchConfig } = useAppConfig();
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [analyticsModalDismissed, setAnalyticsModalDismissed] = useState(false);

  const handleRoleSelect = useCallback((role: 'admin' | 'user' | null) => {
    actions.updateRuntimeState({ selectedRole: role });
    serverExperience.setSelfReportedAdmin(role === 'admin');
  }, [actions, serverExperience]);

  const handlePasswordChanged = useCallback(() => {
    actions.updateRuntimeState({ requiresPasswordChange: false });
    window.location.href = '/login';
  }, [actions]);

  // Check if we should show analytics modal before onboarding
  useEffect(() => {
    if (!isLoading && !analyticsModalDismissed && serverExperience.effectiveIsAdmin && config?.enableAnalytics == null) {
      setShowAnalyticsModal(true);
    }
  }, [isLoading, analyticsModalDismissed, serverExperience.effectiveIsAdmin, config?.enableAnalytics]);

  const handleAnalyticsChoice = useCallback(async (enableAnalytics: boolean) => {
    if (analyticsLoading) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);

    try {
      const formData = new FormData();
      formData.append('enabled', enableAnalytics.toString());

      await apiClient.post('/api/v1/settings/update-enable-analytics', formData);
      await refetchConfig();
      setShowAnalyticsModal(false);
      setAnalyticsModalDismissed(true);
      setAnalyticsLoading(false);
    } catch (error) {
      setAnalyticsError(error instanceof Error ? error.message : 'Unknown error');
      setAnalyticsLoading(false);
    }
  }, [analyticsLoading, refetchConfig]);

  const handleButtonAction = useCallback(async (action: ButtonAction) => {
    switch (action) {
      case 'next':
      case 'complete-close':
        actions.complete();
        break;
      case 'prev':
        actions.prev();
        break;
      case 'close':
        actions.skip();
        break;
      case 'download-selected':
        handleDownloadSelected();
        actions.complete();
        break;
      case 'security-next':
        if (!runtimeState.selectedRole) return;
        if (runtimeState.selectedRole !== 'admin') {
          actions.updateRuntimeState({ tourType: 'whatsnew' });
          setIsTourOpen(true);
        }
        actions.complete();
        break;
      case 'launch-admin':
        actions.updateRuntimeState({ tourType: 'admin' });
        setIsTourOpen(true);
        break;
      case 'launch-tools':
        actions.updateRuntimeState({ tourType: 'whatsnew' });
        setIsTourOpen(true);
        break;
      case 'launch-auto': {
        const tourType = serverExperience.effectiveIsAdmin || runtimeState.selectedRole === 'admin' ? 'admin' : 'whatsnew';
        actions.updateRuntimeState({ tourType });
        setIsTourOpen(true);
        break;
      }
      case 'skip-to-license':
        actions.complete();
        break;
      case 'skip-tour':
        actions.complete();
        break;
      case 'see-plans':
        actions.complete();
        navigate('/settings/adminPlan');
        break;
      case 'enable-analytics':
        await handleAnalyticsChoice(true);
        break;
      case 'disable-analytics':
        await handleAnalyticsChoice(false);
        break;
    }
  }, [actions, handleAnalyticsChoice, handleDownloadSelected, navigate, runtimeState.selectedRole, serverExperience.effectiveIsAdmin]);

  const isRTL = typeof document !== 'undefined' ? document.documentElement.dir === 'rtl' : false;
  const [isTourOpen, setIsTourOpen] = useState(false);

  useEffect(() => dispatchTourState(isTourOpen), [isTourOpen]);

  const { openFilesModal, closeFilesModal } = useFilesModalContext();
  const tourOrch = useTourOrchestration();
  const adminTourOrch = useAdminTourOrchestration();

  const userStepsConfig = useMemo(
    () => createUserStepsConfig({
      t,
      actions: {
        saveWorkbenchState: tourOrch.saveWorkbenchState,
        closeFilesModal,
        backToAllTools: tourOrch.backToAllTools,
        selectCropTool: tourOrch.selectCropTool,
        loadSampleFile: tourOrch.loadSampleFile,
        switchToActiveFiles: tourOrch.switchToActiveFiles,
        pinFile: tourOrch.pinFile,
        modifyCropSettings: tourOrch.modifyCropSettings,
        executeTool: tourOrch.executeTool,
        openFilesModal,
      },
    }),
    [t, tourOrch, closeFilesModal, openFilesModal]
  );

  const whatsNewStepsConfig = useMemo(
    () => createWhatsNewStepsConfig({
      t,
      actions: {
        saveWorkbenchState: tourOrch.saveWorkbenchState,
        closeFilesModal,
        backToAllTools: tourOrch.backToAllTools,
        openFilesModal,
        loadSampleFile: tourOrch.loadSampleFile,
        switchToViewer: tourOrch.switchToViewer,
        switchToPageEditor: tourOrch.switchToPageEditor,
        switchToActiveFiles: tourOrch.switchToActiveFiles,
        selectFirstFile: tourOrch.selectFirstFile,
      },
    }),
    [t, tourOrch, closeFilesModal, openFilesModal]
  );

  const adminStepsConfig = useMemo(
    () => createAdminStepsConfig({
      t,
      actions: {
        saveAdminState: adminTourOrch.saveAdminState,
        openConfigModal: adminTourOrch.openConfigModal,
        navigateToSection: adminTourOrch.navigateToSection,
        scrollNavToSection: adminTourOrch.scrollNavToSection,
      },
    }),
    [t, adminTourOrch]
  );

  const tourSteps = useMemo<StepType[]>(() => {
    switch (runtimeState.tourType) {
      case 'admin':
        return Object.values(adminStepsConfig);
      case 'whatsnew':
        return Object.values(whatsNewStepsConfig);
      default:
        return Object.values(userStepsConfig);
    }
  }, [adminStepsConfig, runtimeState.tourType, userStepsConfig, whatsNewStepsConfig]);

  useEffect(() => {
    if (externalTourRequested) {
      actions.updateRuntimeState({ tourType: requestedTourType });
      setIsTourOpen(true);
      clearTourRequest();
    }
  }, [externalTourRequested, requestedTourType, actions, clearTourRequest]);

  useEffect(() => {
    if (!isTourOpen) removeAllGlows();
    return () => removeAllGlows();
  }, [isTourOpen]);

  const finishTour = useCallback(() => {
    setIsTourOpen(false);
    if (runtimeState.tourType === 'admin') {
      adminTourOrch.restoreAdminState();
    } else {
      tourOrch.restoreWorkbenchState();
    }
    // Advance to next onboarding step after tour completes
    actions.complete();
  }, [actions, adminTourOrch, runtimeState.tourType, tourOrch]);

  const handleAdvanceTour = useCallback((args: AdvanceArgs) => {
    const { setCurrentStep, currentStep: tourCurrentStep, steps, setIsOpen } = args;
    if (steps && tourCurrentStep === steps.length - 1) {
      setIsOpen(false);
      finishTour();
    } else if (steps) {
      setCurrentStep((s) => (s === steps.length - 1 ? 0 : s + 1));
    }
  }, [finishTour]);

  const handleCloseTour = useCallback((args: CloseArgs) => {
    args.setIsOpen(false);
    finishTour();
  }, [finishTour]);

  const currentSlideDefinition = useMemo(() => {
    if (!currentStep || currentStep.type !== 'modal-slide' || !currentStep.slideId) {
      return null;
    }
    return SLIDE_DEFINITIONS[currentStep.slideId as SlideId];
  }, [currentStep]);

  const currentSlideContent = useMemo(() => {
    if (!currentSlideDefinition) return null;
    return currentSlideDefinition.createSlide({
      osLabel: osInfo.label,
      osUrl: osInfo.url,
      osOptions,
      onDownloadUrlChange: setSelectedDownloadUrl,
      selectedRole: runtimeState.selectedRole,
      onRoleSelect: handleRoleSelect,
      licenseNotice: runtimeState.licenseNotice,
      loginEnabled: serverExperience.loginEnabled,
      firstLoginUsername: runtimeState.firstLoginUsername,
      onPasswordChanged: handlePasswordChanged,
      usingDefaultCredentials: runtimeState.usingDefaultCredentials,
      analyticsError,
      analyticsLoading,
    });
  }, [analyticsError, analyticsLoading, currentSlideDefinition, osInfo, osOptions, runtimeState.selectedRole, runtimeState.licenseNotice, handleRoleSelect, serverExperience.loginEnabled, setSelectedDownloadUrl, runtimeState.firstLoginUsername, handlePasswordChanged]);

  const modalSlideCount = useMemo(() => {
    return activeFlow.filter((step) => step.type === 'modal-slide').length;
  }, [activeFlow]);

  const currentModalSlideIndex = useMemo(() => {
    if (!currentStep || currentStep.type !== 'modal-slide') return 0;
    const modalSlides = activeFlow.filter((step) => step.type === 'modal-slide');
    return modalSlides.findIndex((step) => step.id === currentStep.id);
  }, [activeFlow, currentStep]);

  if (bypassOnboarding) {
    return null;
  }

  if (onAuthRoute) {
    return null;
  }

  // Show analytics modal before onboarding if needed
  if (showAnalyticsModal) {
    const slideDefinition = SLIDE_DEFINITIONS['analytics-choice'];
    const slideContent = slideDefinition.createSlide({
      osLabel: '',
      osUrl: '',
      selectedRole: null,
      onRoleSelect: () => {},
      analyticsError,
      analyticsLoading,
    });

    return (
      <OnboardingModalSlide
        slideDefinition={slideDefinition}
        slideContent={slideContent}
        runtimeState={runtimeState}
        modalSlideCount={1}
        currentModalSlideIndex={0}
        onSkip={() => {}} // No skip allowed
        onAction={async (action) => {
          if (action === 'enable-analytics') {
            await handleAnalyticsChoice(true);
          } else if (action === 'disable-analytics') {
            await handleAnalyticsChoice(false);
          }
        }}
        allowDismiss={false}
      />
    );
  }

  if (showLicenseSlide) {
    const baseSlideDefinition = SLIDE_DEFINITIONS['server-license'];
    // Remove back button for external license notice
    const slideDefinition = {
      ...baseSlideDefinition,
      buttons: baseSlideDefinition.buttons.filter(btn => btn.key !== 'license-back')
    };
    const effectiveLicenseNotice = externalLicenseNotice || runtimeState.licenseNotice;
    const slideContent = slideDefinition.createSlide({
      osLabel: '',
      osUrl: '',
      osOptions: [],
      onDownloadUrlChange: () => {},
      selectedRole: null,
      onRoleSelect: () => {},
      licenseNotice: effectiveLicenseNotice,
      loginEnabled: serverExperience.loginEnabled,
    });

    return (
      <OnboardingModalSlide
        slideDefinition={slideDefinition}
        slideContent={slideContent}
        runtimeState={{ ...runtimeState, licenseNotice: effectiveLicenseNotice }}
        modalSlideCount={1}
        currentModalSlideIndex={0}
        onSkip={closeLicenseSlide}
        onAction={(action) => {
          if (action === 'see-plans') {
            closeLicenseSlide();
            navigate('/settings/adminPlan');
          } else {
            closeLicenseSlide();
          }
        }}
      />
    );
  }

  // Always render the tour component (it controls its own visibility with isOpen)
  const tourComponent = (
    <OnboardingTour
      isOpen={isTourOpen}
      tourSteps={tourSteps}
      tourType={runtimeState.tourType}
      isRTL={isRTL}
      t={t}
      onAdvance={handleAdvanceTour}
      onClose={handleCloseTour}
    />
  );

  // If no active onboarding, just show the tour (which may or may not be open)
  if (isLoading || !isActive || !currentStep) {
    return tourComponent;
  }

  // If tour is open, hide the onboarding modal and just show the tour
  if (isTourOpen) {
    return tourComponent;
  }

  // Render the current onboarding step
  switch (currentStep.type) {
    case 'tool-prompt':
      return <ToolPanelModePrompt forceOpen={true} onComplete={actions.complete} />;

    case 'modal-slide':
      if (!currentSlideDefinition || !currentSlideContent) return null;
      return (
        <OnboardingModalSlide
          slideDefinition={currentSlideDefinition}
          slideContent={currentSlideContent}
          runtimeState={runtimeState}
          modalSlideCount={modalSlideCount}
          currentModalSlideIndex={currentModalSlideIndex}
          onSkip={actions.skip}
          onAction={handleButtonAction}
        />
      );

    default:
      return null;
  }
}
