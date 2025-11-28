/**
 * Onboarding Orchestrator Hook
 * 
 * This is the central brain of the onboarding system.
 * It manages:
 * - Determining which steps to show based on conditions and version tracking
 * - Current step navigation (forward AND backward)
 * - Runtime state that affects step conditions
 * - Transitions between different step types
 * 
 * KEY BEHAVIOR:
 * - On mount, finds the first unseen step and starts there
 * - During the session, keeps ALL steps in the flow (allows going back)
 * - Marks steps as seen in localStorage when completed
 * - On next mount/refresh, skips already-seen steps
 */

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
  hasSeenStep,
  markStepSeen,
  migrateFromLegacyPreferences,
} from '@app/components/onboarding/orchestrator/onboardingStorage';
import { accountService } from '@app/services/accountService';

// Auth routes where onboarding should NOT show
const AUTH_ROUTES = ['/login', '/signup', '/auth', '/invite'];

// Session storage keys for persisting runtime state across remounts
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
    const tourType = (sessionStorage.getItem(SESSION_TOUR_TYPE) as 'admin' | 'tools') || 'tools';
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

// Persist runtime state to session storage
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
  } catch {
    // Ignore storage errors
  }
}

// Clear session storage when onboarding completes
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
  // ============================================
  // External State & Context
  // ============================================
  const serverExperience = useServerExperience();
  const { config, loading: configLoading } = useAppConfig();
  const location = useLocation();

  // ============================================
  // Internal State - Initialize from session storage to survive remounts
  // ============================================
  const [runtimeState, setRuntimeState] = useState<OnboardingRuntimeState>(() => 
    getInitialRuntimeState(defaultState)
  );
  const [isPaused, setIsPaused] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1); // -1 means not yet calculated
  const migrationDone = useRef(false);
  const initialIndexSet = useRef(false);

  // ============================================
  // Initialization & Migration
  // ============================================
  useEffect(() => {
    if (!migrationDone.current) {
      migrateFromLegacyPreferences();
      migrationDone.current = true;
    }
  }, []);

  // Sync runtime state with external state
  useEffect(() => {
    setRuntimeState((prev) => ({
      ...prev,
      analyticsEnabled: config?.enableAnalytics === true,
      // Analytics is "not configured" if null OR undefined (YAML null may come as undefined in JSON)
      analyticsNotConfigured: config?.enableAnalytics == null,
      // Update license notice from server experience
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

  // Check for first login password change requirement
  useEffect(() => {
    const checkFirstLogin = async () => {
      // Only check if login is enabled and user has a token
      if (config?.enableLogin !== true || !hasAuthToken()) {
        return;
      }

      try {
        // Fetch account data and login page data in parallel
        const [accountData, loginPageData] = await Promise.all([
          accountService.getAccountData(),
          accountService.getLoginPageData(),
        ]);
        
        setRuntimeState((prev) => ({
          ...prev,
          requiresPasswordChange: accountData.changeCredsFlag,
          firstLoginUsername: accountData.username,
          // If showDefaultCredentials is true, we know the password is "stirling"
          usingDefaultCredentials: loginPageData.showDefaultCredentials,
        }));
      } catch (err) {
        // If account endpoint fails, user doesn't have security enabled or isn't logged in
        console.debug('[Orchestrator] Could not fetch account data:', err);
      }
    };

    if (!configLoading) {
      checkFirstLogin();
    }
  }, [config?.enableLogin, configLoading]);

  // ============================================
  // Route-based checks
  // ============================================
  const isOnAuthRoute = AUTH_ROUTES.some((route) => location.pathname.startsWith(route));
  const loginEnabled = config?.enableLogin === true;
  const isUnauthenticatedWithLoginEnabled = loginEnabled && !hasAuthToken();

  // Don't show onboarding on auth routes or when config is still loading
  const shouldBlockOnboarding = isOnAuthRoute || configLoading || isUnauthenticatedWithLoginEnabled;

  // ============================================
  // Build Condition Context
  // ============================================
  const conditionContext = useMemo<OnboardingConditionContext>(() => ({
    ...serverExperience,
    ...runtimeState,
    // Ensure effectiveIsAdmin reflects self-reported admin from security check
    effectiveIsAdmin: serverExperience.effectiveIsAdmin || 
      (!serverExperience.loginEnabled && runtimeState.selectedRole === 'admin'),
  }), [serverExperience, runtimeState]);

  // ============================================
  // Build the flow of steps that pass their conditions
  // This is the FULL flow - we keep all steps during the session
  // ============================================
  const activeFlow = useMemo(() => {
    return ONBOARDING_STEPS.filter((step) => step.condition(conditionContext));
  }, [conditionContext]);

  // ============================================
  // Find initial step index on mount (first unseen step)
  // IMPORTANT: Wait for config AND admin status to load before calculating,
  // to avoid race conditions where effectiveIsAdmin changes after initial calculation
  // ============================================
  
  // Admin status is resolved when:
  // 1. Config has loaded (configLoading = false), AND
  // 2. Either: login is disabled (no need to wait for auth), OR
  //    login is enabled AND isAdmin is defined (auth has been checked)
  const adminStatusResolved = !configLoading && (
    config?.enableLogin === false || 
    config?.enableLogin === undefined || 
    config?.isAdmin !== undefined
  );
  
  useEffect(() => {
    // Don't calculate until config AND admin status have loaded
    if (configLoading || !adminStatusResolved || activeFlow.length === 0) {
      return;
    }
    
    // Find the first unseen step
    let firstUnseenIndex = -1;
    for (let i = 0; i < activeFlow.length; i++) {
      if (!hasSeenStep(activeFlow[i].id)) {
        firstUnseenIndex = i;
        break;
      }
    }
    
    // If all steps have been seen, mark as complete
    if (firstUnseenIndex === -1) {
      setCurrentStepIndex(activeFlow.length); // Past the end = complete
      initialIndexSet.current = true;
    } else if (!initialIndexSet.current) {
      // Only set initial index on first mount, not on subsequent activeFlow changes
      setCurrentStepIndex(firstUnseenIndex);
      initialIndexSet.current = true;
    }
  }, [activeFlow, configLoading, adminStatusResolved]);

  // ============================================
  // Derived State
  // ============================================
  const totalSteps = activeFlow.length;
  
  // Check if all steps in the flow have been seen
  // Returns false if flow is empty (still loading) to prevent false positives
  const allStepsAlreadySeen = useMemo(() => {
    if (activeFlow.length === 0) return false; // Not ready yet
    return activeFlow.every(step => hasSeenStep(step.id));
  }, [activeFlow]);
  
  // Only consider complete when initialized AND all steps seen
  const isComplete = isInitialized && initialIndexSet.current && 
    (currentStepIndex >= totalSteps || allStepsAlreadySeen);
  const currentStep = (currentStepIndex >= 0 && currentStepIndex < totalSteps && !allStepsAlreadySeen) 
    ? activeFlow[currentStepIndex] 
    : null;
  const isActive = !shouldBlockOnboarding && !isPaused && !isComplete && isInitialized && currentStep !== null;
  const isLoading = configLoading || !adminStatusResolved || !isInitialized || 
    !initialIndexSet.current || (currentStepIndex === -1 && activeFlow.length > 0);

  // Mark as initialized once config is loaded
  useEffect(() => {
    if (!configLoading && !isInitialized) {
      setIsInitialized(true);
    }
  }, [configLoading, isInitialized]);

  // Clear session storage when onboarding completes
  useEffect(() => {
    if (isComplete) {
      clearRuntimeStateSession();
    }
  }, [isComplete]);

  // ============================================
  // Actions
  // ============================================
  
  // Move to next step and mark current as seen
  const next = useCallback(() => {
    if (currentStep) {
      markStepSeen(currentStep.id);
    }
    setCurrentStepIndex((prev) => Math.min(prev + 1, totalSteps));
  }, [currentStep, totalSteps]);

  // Move to previous step (allows going back)
  const prev = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  // Skip current step (marks as seen and moves forward)
  const skip = useCallback(() => {
    if (currentStep) {
      markStepSeen(currentStep.id);
    }
    setCurrentStepIndex((prev) => Math.min(prev + 1, totalSteps));
  }, [currentStep, totalSteps]);

  // Complete current step (same as next - marks as seen and advances)
  const complete = useCallback(() => {
    if (currentStep) {
      markStepSeen(currentStep.id);
    }
    setCurrentStepIndex((prev) => Math.min(prev + 1, totalSteps));
  }, [currentStep, totalSteps]);

  // Skip steps that have already been seen (e.g., returning users)
  useEffect(() => {
    if (!currentStep || isLoading) {
      return;
    }
    if (hasSeenStep(currentStep.id)) {
      complete();
    }
  }, [currentStep, isLoading, complete]);

  const updateRuntimeState = useCallback((updates: Partial<OnboardingRuntimeState>) => {
    // Persist critical state to session storage so it survives remounts
    persistRuntimeState(updates);
    setRuntimeState((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const refreshFlow = useCallback(() => {
    // Reset to recalculate the flow
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

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  // ============================================
  // Return Value
  // ============================================
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
