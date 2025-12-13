import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ONBOARDING_STEPS } from '@app/components/onboarding/orchestrator/onboardingConfig';
import { markStepSeen } from '@app/components/onboarding/orchestrator/onboardingStorage';

const SESSION_KEY = 'onboarding::bypass-all';
const PARAM_KEY = 'bypassOnboarding';

function isTruthy(value: string | null): boolean {
  return value?.toLowerCase() === 'true';
}

function readStoredBypass(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function setStoredBypass(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore storage errors to avoid blocking the bypass flow
  }
}

/**
 * Detects the `bypassOnboarding` query parameter and stores it in session storage
 * so that onboarding remains disabled while the app is open. Also marks all steps
 * as seen to ensure any dependent UI elements remain hidden.
 */
export function useBypassOnboarding(): boolean {
  const location = useLocation();
  const [bypassOnboarding, setBypassOnboarding] = useState<boolean>(() => readStoredBypass());
  const stepsMarkedRef = useRef(false);

  const shouldBypassFromSearch = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search);
      return isTruthy(params.get(PARAM_KEY));
    } catch {
      return false;
    }
  }, [location.search]);

  useEffect(() => {
    const fromStorage = readStoredBypass();
    const nextBypass = shouldBypassFromSearch || fromStorage;
    setBypassOnboarding(nextBypass);
    if (nextBypass) {
      setStoredBypass(true);
    }
  }, [shouldBypassFromSearch]);

  useEffect(() => {
    if (!bypassOnboarding || stepsMarkedRef.current) return;
    stepsMarkedRef.current = true;
    ONBOARDING_STEPS.forEach((step) => markStepSeen(step.id));
  }, [bypassOnboarding]);

  return bypassOnboarding;
}
