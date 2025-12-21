import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useServerExperience } from '@app/hooks/useServerExperience';
import { useAppConfig } from '@app/contexts/AppConfigContext';

import {
  ONBOARDING_STEPS,
  type OnboardingStepId,
  type OnboardingStep,
  type OnboardingRuntimeState,
  type OnboardingConditionContext,
  DEFAULT_RUNTIME_STATE,
} from '@app/components/onboarding/orchestrator/onboardingConfig';
import {
  isOnboardingCompleted,
  markOnboardingCompleted,
  migrateFromLegacyPreferences,
} from '@app/components/onboarding/orchestrator/onboardingStorage';
import { accountService } from '@app/services/accountService';
import { useBypassOnboarding } from '@app/components/onboarding/useBypassOnboarding';

const AUTH_ROUTES = ['/login', '/signup', '/auth', '/invite'];
const SESSION_TOUR_REQUESTED = 'onboarding::session::tour-requested';
const SESSION_TOUR_TYPE = 'onboarding::session::tour-type';
const SESSION_SELECTED_ROLE = 'onboarding::session::selected-role';

// Check if user has an auth token (to avoid flash before redirect)
function hasAuthToken(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('stirling_jwt');
}

// Get initial runtime state from session storage (survives remounts)
function getInitialRuntimeState(baseState: OnboardingRuntimeState): OnboardingRuntimeState {
  if (typeof window === 'undefined') {
    return baseState;
  }

  try {
    const tourRequested = sessionStorage.getItem(SESSION_TOUR_REQUESTED) === 'true';
    const sessionTourType = sessionStorage.getItem(SESSION_TOUR_TYPE);
    const tourType = (sessionTourType === 'admin' || sessionTourType === 'tools' || sessionTourType === 'whatsnew')
      ? sessionTourType
      : 'whatsnew';
    const selectedRole = sessionStorage.getItem(SESSION_SELECTED_ROLE) as 'admin' | 'user' | null;

    return {
      ...baseState,
      tourRequested,
      tourType,
      selectedRole,
    };
  } catch {
    return baseState;
  }
}

function persistRuntimeState(state: Partial<OnboardingRuntimeState>): void {
  if (typeof window === 'undefined') return;

  try {
    if (state.tourRequested !== undefined) {
      sessionStorage.setItem(SESSION_TOUR_REQUESTED, state.tourRequested ? 'true' : 'false');
    }
    if (state.tourType !== undefined) {
      sessionStorage.setItem(SESSION_TOUR_TYPE, state.tourType);
    }
    if (state.selectedRole !== undefined) {
      if (state.selectedRole) {
        sessionStorage.setItem(SESSION_SELECTED_ROLE, state.selectedRole);
      } else {
        sessionStorage.removeItem(SESSION_SELECTED_ROLE);
      }
    }
  } catch (error) {
    console.error('[useOnboardingOrchestrator] Error persisting runtime state:', error);
  }
}

function clearRuntimeStateSession(): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(SESSION_TOUR_REQUESTED);
    sessionStorage.removeItem(SESSION_TOUR_TYPE);
    sessionStorage.removeItem(SESSION_SELECTED_ROLE);
  } catch {
    // Ignore errors
  }
}

export interface OnboardingOrchestratorState {
  /** Whether onboarding is currently active */
  isActive: boolean;
  /** The current step being shown (null if no step is active) */
  currentStep: OnboardingStep | null;
  /** Index of current step in the active flow (for display purposes) */
  currentStepIndex: number;
  /** Total number of steps in the active flow */
  totalSteps: number;
  /** Runtime state that affects conditions */
  runtimeState: OnboardingRuntimeState;
  /** All steps that will be shown in this flow (filtered by conditions) */
  activeFlow: OnboardingStep[];
  /** Whether all steps have been seen */
  isComplete: boolean;
  /** Whether we're still initializing */
  isLoading: boolean;
}

export interface OnboardingOrchestratorActions {
  /** Move to the next step */
  next: () => void;
  /** Move to the previous step */
  prev: () => void;
  /** Skip the current step (marks as seen but doesn't complete) */
  skip: () => void;
  /** Mark current step as seen and move to next */
  complete: () => void;
  /** Update runtime state (e.g., after role selection) */
  updateRuntimeState: (updates: Partial<OnboardingRuntimeState>) => void;
  /** Force re-evaluation of the flow (used when conditions change) */
  refreshFlow: () => void;
  /** Manually start a specific step (for external triggers) */
  startStep: (stepId: OnboardingStepId) => void;
  /** Close/pause onboarding (can be resumed later) */
  pause: () => void;
  /** Resume onboarding from where it was paused */
  resume: () => void;
}

export interface UseOnboardingOrchestratorResult {
  state: OnboardingOrchestratorState;
  actions: OnboardingOrchestratorActions;
}

export interface UseOnboardingOrchestratorOptions {
  /** Override the default runtime state (used by desktop to set isDesktopApp: true) */
  defaultRuntimeState?: OnboardingRuntimeState;
}

export function useOnboardingOrchestrator(
  options?: UseOnboardingOrchestratorOptions
): UseOnboardingOrchestratorResult {
  const defaultState = options?.defaultRuntimeState ?? DEFAULT_RUNTIME_STATE;
  const serverExperience = useServerExperience();
  const { config, loading: configLoading } = useAppConfig();
  const location = useLocation();
  const bypassOnboarding = useBypassOnboarding();

  const [runtimeState, setRuntimeState] = useState<OnboardingRuntimeState>(() =>
    getInitialRuntimeState(defaultState)
  );
  const [isPaused, setIsPaused] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const migrationDone = useRef(false);
  const initialIndexSet = useRef(false);

  useEffect(() => {
    if (!migrationDone.current) {
      migrateFromLegacyPreferences();
      migrationDone.current = true;
    }
  }, []);

  useEffect(() => {
    setRuntimeState((prev) => ({
      ...prev,
      analyticsEnabled: config?.enableAnalytics === true,
      analyticsNotConfigured: config?.enableAnalytics == null,
      desktopSlideEnabled: config?.enableDesktopInstallSlide ?? true,
      licenseNotice: {
        totalUsers: serverExperience.totalUsers,
        freeTierLimit: serverExperience.freeTierLimit,
        isOverLimit: serverExperience.overFreeTierLimit ?? false,
        requiresLicense: !serverExperience.hasPaidLicense && (
          serverExperience.overFreeTierLimit === true ||
          (serverExperience.effectiveIsAdmin && serverExperience.userCountResolved)
        ),
      },
    }));
  }, [
    config?.enableAnalytics,
    serverExperience.totalUsers,
    serverExperience.freeTierLimit,
    serverExperience.overFreeTierLimit,
    serverExperience.hasPaidLicense,
    serverExperience.effectiveIsAdmin,
    serverExperience.userCountResolved,
  ]);

  useEffect(() => {
    const checkFirstLogin = async () => {
      if (config?.enableLogin !== true || !hasAuthToken()) return;

      try {
        const [accountData, loginPageData] = await Promise.all([
          accountService.getAccountData(),
          accountService.getLoginPageData(),
        ]);

        setRuntimeState((prev) => ({
          ...prev,
          requiresPasswordChange: accountData.changeCredsFlag,
          firstLoginUsername: accountData.username,
          usingDefaultCredentials: loginPageData.showDefaultCredentials,
        }));
      } catch {
        // Account endpoint failed - user not logged in or security disabled
      }
    };

    if (!configLoading) {
      checkFirstLogin();
    }
  }, [config?.enableLogin, configLoading]);

  const isOnAuthRoute = AUTH_ROUTES.some((route) => location.pathname.startsWith(route));
  const loginEnabled = config?.enableLogin === true;
  const isUnauthenticatedWithLoginEnabled = loginEnabled && !hasAuthToken();
  const shouldBlockOnboarding =
    bypassOnboarding || isOnAuthRoute || configLoading || isUnauthenticatedWithLoginEnabled;

  const conditionContext = useMemo<OnboardingConditionContext>(() => ({
    ...serverExperience,
    ...runtimeState,
    effectiveIsAdmin: serverExperience.effectiveIsAdmin ||
      (!serverExperience.loginEnabled && runtimeState.selectedRole === 'admin'),
  }), [serverExperience, runtimeState]);

  const activeFlow = useMemo(() => {
    // If password change is required, ONLY show the first-login step
    if (runtimeState.requiresPasswordChange) {
      return ONBOARDING_STEPS.filter((step) => step.id === 'first-login');
    }
    return ONBOARDING_STEPS.filter((step) => step.condition(conditionContext));
  }, [conditionContext, runtimeState.requiresPasswordChange]);

  // Wait for config AND admin status before calculating initial step
  const adminStatusResolved = !configLoading && (
    config?.enableLogin === false ||
    config?.enableLogin === undefined ||
    config?.isAdmin !== undefined
  );

  useEffect(() => {
    if (configLoading || !adminStatusResolved) return;

    // If there are no steps to show, mark initialized/completed baseline
    if (activeFlow.length === 0) {
      setCurrentStepIndex(0);
      initialIndexSet.current = true;
      return;
    }

    // If onboarding has been completed, don't show it
    if (isOnboardingCompleted() && !runtimeState.requiresPasswordChange) {
      setCurrentStepIndex(activeFlow.length);
      initialIndexSet.current = true;
      return;
    }

    // Start from the beginning
    if (!initialIndexSet.current) {
      setCurrentStepIndex(0);
      initialIndexSet.current = true;
    }
  }, [activeFlow, configLoading, adminStatusResolved, runtimeState.requiresPasswordChange]);

  const totalSteps = activeFlow.length;

  const isComplete = isInitialized &&
    (totalSteps === 0 || currentStepIndex >= totalSteps || isOnboardingCompleted());
  const currentStep = (currentStepIndex >= 0 && currentStepIndex < totalSteps)
    ? activeFlow[currentStepIndex]
    : null;
  const isActive = !shouldBlockOnboarding && !isPaused && !isComplete && isInitialized && currentStep !== null;
  const isLoading = configLoading || !adminStatusResolved || !isInitialized ||
    !initialIndexSet.current || (currentStepIndex === -1 && activeFlow.length > 0);

  useEffect(() => {
    if (!configLoading && !isInitialized) setIsInitialized(true);
  }, [configLoading, isInitialized]);

  useEffect(() => {
    if (isComplete) clearRuntimeStateSession();
  }, [isComplete]);

  const next = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= totalSteps) {
      // Reached the end, mark onboarding as completed
      markOnboardingCompleted();
    }
    setCurrentStepIndex(nextIndex);
  }, [currentStepIndex, totalSteps]);

  const prev = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const skip = useCallback(() => {
    // Skip marks the entire onboarding as completed
    markOnboardingCompleted();
    setCurrentStepIndex(totalSteps);
  }, [totalSteps]);

  const complete = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= totalSteps) {
      // Reached the end, mark onboarding as completed
      markOnboardingCompleted();
    }
    setCurrentStepIndex(nextIndex);
  }, [currentStepIndex, totalSteps]);


  const updateRuntimeState = useCallback((updates: Partial<OnboardingRuntimeState>) => {
    persistRuntimeState(updates);
    setRuntimeState((prev) => ({ ...prev, ...updates }));
  }, []);

  const refreshFlow = useCallback(() => {
    initialIndexSet.current = false;
    setCurrentStepIndex(-1);
  }, []);

  const startStep = useCallback((stepId: OnboardingStepId) => {
    const index = activeFlow.findIndex((step) => step.id === stepId);
    if (index !== -1) {
      setCurrentStepIndex(index);
      setIsPaused(false);
    }
  }, [activeFlow]);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  const state: OnboardingOrchestratorState = {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    runtimeState,
    activeFlow,
    isComplete,
    isLoading,
  };

  const actions: OnboardingOrchestratorActions = {
    next,
    prev,
    skip,
    complete,
    updateRuntimeState,
    refreshFlow,
    startStep,
    pause,
    resume,
  };

  return { state, actions };
}
