import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { markOnboardingCompleted } from '@app/components/onboarding/orchestrator/onboardingStorage';

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
 * so that onboarding remains disabled while the app is open. Also marks onboarding
 * as completed to ensure any dependent UI elements remain hidden.
 */
export function useBypassOnboarding(): boolean {
  const location = useLocation();
  const [bypassOnboarding, setBypassOnboarding] = useState<boolean>(() => readStoredBypass());

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
      markOnboardingCompleted();
    }
  }, [shouldBypassFromSearch]);

  return bypassOnboarding;
}
