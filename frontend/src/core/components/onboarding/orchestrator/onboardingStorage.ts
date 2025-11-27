/**
 * Onboarding Storage
 * 
 * Simple localStorage wrapper for tracking which onboarding steps have been seen.
 * Keys: `onboarding::${stepId}` with value 'true'
 */

import { type OnboardingStepId, ONBOARDING_STEPS } from '@app/components/onboarding/orchestrator/onboardingConfig';

const STORAGE_PREFIX = 'onboarding';

/**
 * Generate the storage key for a step
 */
export function getStorageKey(stepId: OnboardingStepId): string {
  return `${STORAGE_PREFIX}::${stepId}`;
}

/**
 * Check if a step has been seen
 */
export function hasSeenStep(stepId: OnboardingStepId): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    return localStorage.getItem(getStorageKey(stepId)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark a step as seen
 */
export function markStepSeen(stepId: OnboardingStepId): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(getStorageKey(stepId), 'true');
  } catch {
    // Ignore storage write failures
  }
}

/**
 * Mark a step as not seen (for resetting)
 */
export function resetStepSeen(stepId: OnboardingStepId): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(getStorageKey(stepId));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset all onboarding progress (for testing/debugging)
 */
export function resetAllOnboardingProgress(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const prefix = `${STORAGE_PREFIX}::`;
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore errors
  }
}

/**
 * Get the storage state for debugging
 */
export function getOnboardingStorageState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  ONBOARDING_STEPS.forEach((step) => {
    state[step.id] = hasSeenStep(step.id);
  });
  return state;
}

/**
 * One-time migration from legacy preferences.
 * Converts old stirlingpdf_preferences flags to new onboarding:: keys.
 */
export function migrateFromLegacyPreferences(): void {
  if (typeof window === 'undefined') return;
  
  const migrationKey = `${STORAGE_PREFIX}::migrated`;
  
  try {
    // Skip if already migrated
    if (localStorage.getItem(migrationKey) === 'true') return;
    
    const prefsRaw = localStorage.getItem('stirlingpdf_preferences');
    if (prefsRaw) {
      const prefs = JSON.parse(prefsRaw) as Record<string, unknown>;
      
      // Migrate based on legacy flags
      if (prefs.hasSeenIntroOnboarding === true) {
        markStepSeen('welcome');
        markStepSeen('desktop-install');
        markStepSeen('security-check');
        markStepSeen('admin-overview');
      }
      
      if (prefs.toolPanelModePromptSeen === true || prefs.hasSelectedToolPanelMode === true) {
        markStepSeen('tool-layout');
      }
      
      if (prefs.hasCompletedOnboarding === true) {
        markStepSeen('tour');
        markStepSeen('analytics-choice');
        markStepSeen('server-license');
      }
      
      if (prefs.hasSeenCookieBanner === true) {
        markStepSeen('cookie-consent');
      }
    }
    
    // Mark migration complete
    localStorage.setItem(migrationKey, 'true');
  } catch {
    // If migration fails, onboarding will show again - safer than hiding it
  }
}
