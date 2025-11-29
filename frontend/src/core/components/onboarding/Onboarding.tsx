/**
 * Unified Onboarding Component
 * 
 * This is the single entry point for all onboarding flows.
 * It orchestrates the onboarding experience based on user state,
 * server configuration, and what the user has already seen.
 * 
 * The component acts as a router for different step types:
 * - modal-slide: Welcome, desktop install, security check, etc.
 * - tool-prompt: Tool panel mode selection
 * - tour: Interactive guided tour
 * - analytics-modal: Admin analytics choice
 */

import { useEffect, useMemo, useCallback, useState } from 'react';
import { type StepType } from '@reactour/tour';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { isAuthRoute } from '@app/constants/routes';
import { dispatchTourState } from '@app/constants/events';
import { useOnboardingOrchestrator } from '@app/components/onboarding/orchestrator/useOnboardingOrchestrator';
import { markStepSeen } from '@app/components/onboarding/orchestrator/onboardingStorage';
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
import { removeAllGlows } from '@app/components/onboarding/tourGlow';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useServerExperience } from '@app/hooks/useServerExperience';
import AdminAnalyticsChoiceModal from '@app/components/shared/AdminAnalyticsChoiceModal';
import '@app/components/onboarding/OnboardingTour.css';

/**
 * Main Onboarding Component
 */
export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, actions } = useOnboardingOrchestrator();
  const serverExperience = useServerExperience();
  const onAuthRoute = isAuthRoute(location.pathname);
  const { currentStep, isActive, isLoading, runtimeState, activeFlow } = state;

  // ============================================
  // Extracted Hooks
  // ============================================

  // Download logic for desktop install slide
  const { osInfo, osOptions, setSelectedDownloadUrl, handleDownloadSelected } = useOnboardingDownload();

  // Server license request handling (from UpgradeBanner "See info" click)
  const { showLicenseSlide, licenseNotice: externalLicenseNotice, closeLicenseSlide } = useServerLicenseRequest();

  // Tour request handling (from QuickAccessBar help menu)
  const { tourRequested: externalTourRequested, requestedTourType, clearTourRequest } = useTourRequest();

  // ============================================
  // Button Action Handler
  // ============================================

  const handleRoleSelect = useCallback((role: 'admin' | 'user' | null) => {
    actions.updateRuntimeState({ selectedRole: role });
    serverExperience.setSelfReportedAdmin(role === 'admin');
  }, [actions, serverExperience]);

  // First login password change handler
  const handlePasswordChanged = useCallback(() => {
    // Password change successful - backend will log user out
    // Clear the requiresPasswordChange flag first
    actions.updateRuntimeState({ requiresPasswordChange: false });
    // Force reload to ensure clean state after password change
    window.location.href = '/login';
  }, [actions]);

  const handleButtonAction = useCallback((action: ButtonAction) => {
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
          actions.updateRuntimeState({ tourRequested: true, tourType: 'tools' });
        }
        actions.complete();
        break;
      case 'launch-admin':
        actions.updateRuntimeState({ tourRequested: true, tourType: 'admin' });
        actions.complete();
        break;
      case 'launch-tools':
        actions.updateRuntimeState({ tourRequested: true, tourType: 'tools' });
        actions.complete();
        break;
      case 'launch-auto': {
        const tourType = serverExperience.effectiveIsAdmin || runtimeState.selectedRole === 'admin' ? 'admin' : 'tools';
        actions.updateRuntimeState({ tourRequested: true, tourType });
        actions.complete();
        break;
      }
      case 'skip-to-license':
        markStepSeen('tour');
        actions.updateRuntimeState({ tourRequested: false });
        actions.complete();
        break;
      case 'see-plans':
        actions.complete();
        navigate('/settings/adminPlan');
        break;
    }
  }, [actions, handleDownloadSelected, navigate, runtimeState.selectedRole, serverExperience.effectiveIsAdmin]);

  // ============================================
  // Tour Setup
  // ============================================
  
  const isRTL = typeof document !== 'undefined' ? document.documentElement.dir === 'rtl' : false;
  const [isTourOpen, setIsTourOpen] = useState(false);

  // Dispatch tour state changes (for hiding cookie consent during tour)
  useEffect(() => {
    dispatchTourState(isTourOpen);
  }, [isTourOpen]);

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
        switchToViewer: tourOrch.switchToViewer,
        switchToPageEditor: tourOrch.switchToPageEditor,
        switchToActiveFiles: tourOrch.switchToActiveFiles,
        selectFirstFile: tourOrch.selectFirstFile,
        pinFile: tourOrch.pinFile,
        modifyCropSettings: tourOrch.modifyCropSettings,
        executeTool: tourOrch.executeTool,
        openFilesModal,
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
    const config = runtimeState.tourType === 'admin' ? adminStepsConfig : userStepsConfig;
    return Object.values(config);
  }, [adminStepsConfig, runtimeState.tourType, userStepsConfig]);

  // Start tour when reaching tour step
  useEffect(() => {
    if (currentStep?.id === 'tour' && !isTourOpen) {
      markStepSeen('tour');
      setIsTourOpen(true);
    }
  }, [currentStep, isTourOpen, activeFlow]);

  // Handle external tour request (from QuickAccessBar help menu)
  useEffect(() => {
    if (externalTourRequested) {
      actions.updateRuntimeState({ tourRequested: true, tourType: requestedTourType });
      markStepSeen('tour');
      setIsTourOpen(true);
      clearTourRequest();
    }
  }, [externalTourRequested, requestedTourType, actions, clearTourRequest]);

  // Clean up tour glows
  useEffect(() => {
    if (!isTourOpen) removeAllGlows();
    return () => removeAllGlows();
  }, [isTourOpen]);

  // Shared tour cleanup: restore state, mark seen, advance if on tour step
  const finishTour = useCallback(() => {
    setIsTourOpen(false);
    if (runtimeState.tourType === 'admin') {
      adminTourOrch.restoreAdminState();
    } else {
      tourOrch.restoreWorkbenchState();
    }
    markStepSeen('tour');
    if (currentStep?.id === 'tour') actions.complete();
  }, [actions, adminTourOrch, currentStep?.id, runtimeState.tourType, tourOrch]);

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

  // ============================================
  // Modal Slide Data
  // ============================================
  
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
    });
  }, [currentSlideDefinition, osInfo, osOptions, runtimeState.selectedRole, runtimeState.licenseNotice, handleRoleSelect, serverExperience.loginEnabled, setSelectedDownloadUrl, runtimeState.firstLoginUsername, handlePasswordChanged]);

  const modalSlideCount = useMemo(() => {
    return activeFlow.filter((step) => step.type === 'modal-slide').length;
  }, [activeFlow]);

  const currentModalSlideIndex = useMemo(() => {
    if (!currentStep || currentStep.type !== 'modal-slide') return 0;
    const modalSlides = activeFlow.filter((step) => step.type === 'modal-slide');
    return modalSlides.findIndex((step) => step.id === currentStep.id);
  }, [activeFlow, currentStep]);

  // ============================================
  // Render Logic
  // ============================================

  // Don't show onboarding on auth routes
  if (onAuthRoute) {
    return null;
  }

  // External trigger: Show server license slide from UpgradeBanner "See info" click
  if (showLicenseSlide) {
    const slideDefinition = SLIDE_DEFINITIONS['server-license'];
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

  // If loading/inactive but tour is open, render tour
  if (isLoading || !isActive || !currentStep) {
    return (
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
  }

  // Route by step type
  switch (currentStep.type) {
    case 'tool-prompt':
      return <ToolPanelModePrompt forceOpen={true} onComplete={actions.complete} />;

    case 'tour':
      return (
        <OnboardingTour
          isOpen={true}
          tourSteps={tourSteps}
          tourType={runtimeState.tourType}
          isRTL={isRTL}
          t={t}
          onAdvance={handleAdvanceTour}
          onClose={handleCloseTour}
        />
      );

    case 'analytics-modal':
      return <AdminAnalyticsChoiceModal opened={true} onClose={actions.complete} />;

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
