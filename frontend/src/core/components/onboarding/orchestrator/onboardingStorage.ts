const STORAGE_PREFIX = 'onboarding';
const TOURS_TOOLTIP_KEY = `${STORAGE_PREFIX}::tours-tooltip-shown`;
const ONBOARDING_COMPLETED_KEY = `${STORAGE_PREFIX}::completed`;

export function isOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  } catch (error) {
    console.error('[onboardingStorage] Error marking onboarding as completed:', error);
  }
}

export function markOnboardingIncomplete(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'false');
  } catch (error) {
    console.error('[onboardingStorage] Error marking onboarding as incomplete:', error);
  }
}

export function resetOnboardingProgress(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  } catch (error) {
    console.error('[onboardingStorage] Error resetting onboarding progress:', error);
  }
}

export function hasShownToursTooltip(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(TOURS_TOOLTIP_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markToursTooltipShown(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOURS_TOOLTIP_KEY, 'true');
  } catch (error) {
    console.error('[onboardingStorage] Error marking tours tooltip as shown:', error);
  }
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

      // If user had completed onboarding in old system, mark new system as complete
      if (prefs.hasCompletedOnboarding === true || prefs.hasSeenIntroOnboarding === true) {
        markOnboardingCompleted();
      }
    }

    // Mark migration complete
    localStorage.setItem(migrationKey, 'true');
  } catch {
    // If migration fails, onboarding will show again - safer than hiding it
  }
}
