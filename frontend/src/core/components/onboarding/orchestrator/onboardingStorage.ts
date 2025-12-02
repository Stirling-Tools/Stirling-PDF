import { type OnboardingStepId, ONBOARDING_STEPS } from '@app/components/onboarding/orchestrator/onboardingConfig';

const STORAGE_PREFIX = 'onboarding';

export function getStorageKey(stepId: OnboardingStepId): string {
  return `${STORAGE_PREFIX}::${stepId}`;
}

export function hasSeenStep(stepId: OnboardingStepId): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(getStorageKey(stepId)) === 'true';
  } catch {
    return false;
  }
}

export function markStepSeen(stepId: OnboardingStepId): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(stepId), 'true');
  } catch (error) {
    console.error('[onboardingStorage] Error marking step as seen:', error);
  }
}

export function resetStepSeen(stepId: OnboardingStepId): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(stepId));
  } catch (error) {
    console.error('[onboardingStorage] Error resetting step seen:', error);
  }
}

export function resetAllOnboardingProgress(): void {
  if (typeof window === 'undefined') return;
  try {
    const prefix = `${STORAGE_PREFIX}::`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error('[onboardingStorage] Error resetting all onboarding progress:', error);
  }
}

export function getOnboardingStorageState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  ONBOARDING_STEPS.forEach((step) => {
    state[step.id] = hasSeenStep(step.id);
  });
  return state;
}

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
      
    }
    
    // Mark migration complete
    localStorage.setItem(migrationKey, 'true');
  } catch {
    // If migration fails, onboarding will show again - safer than hiding it
  }
}
