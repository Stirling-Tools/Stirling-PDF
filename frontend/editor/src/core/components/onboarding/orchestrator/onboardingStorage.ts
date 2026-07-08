const STORAGE_PREFIX = "onboarding";
const TOURS_TOOLTIP_KEY = `${STORAGE_PREFIX}::tours-tooltip-shown`;
const ONBOARDING_COMPLETED_KEY = `${STORAGE_PREFIX}::completed`;

// Per-flow persistence lives under a single namespace so completion state
// composes across build flavors and, in future, checklist-style flows that
// track individual step completion (see setStepDone / getFlowProgress).
const flowSeenKey = (flowId: string) => `${STORAGE_PREFIX}::flow::${flowId}::seen`;
const flowProgressKey = (flowId: string) =>
  `${STORAGE_PREFIX}::flow::${flowId}::progress`;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`[onboardingStorage] Error writing ${key}:`, error);
  }
}

/** Whether a named flow (e.g. "saas", "portal") has been seen/dismissed. */
export function hasSeenFlow(flowId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(flowSeenKey(flowId)) === "true";
  } catch {
    return false;
  }
}

/** Marks a named flow as seen so it does not reappear. */
export function markFlowSeen(flowId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(flowSeenKey(flowId), "true");
  } catch (error) {
    console.error(`[onboardingStorage] Error marking flow "${flowId}":`, error);
  }
}

/** Completed step ids for a checklist-style flow, in completion order. */
export function getFlowProgress(flowId: string): string[] {
  const value = readJson<string[]>(flowProgressKey(flowId), []);
  return Array.isArray(value) ? value : [];
}

/** Whether a single step within a flow has been completed. */
export function isStepDone(flowId: string, stepId: string): boolean {
  return getFlowProgress(flowId).includes(stepId);
}

/** Records a single step within a flow as done (idempotent). */
export function setStepDone(flowId: string, stepId: string): void {
  const progress = getFlowProgress(flowId);
  if (progress.includes(stepId)) return;
  writeJson(flowProgressKey(flowId), [...progress, stepId]);
}

/** Clears both the seen flag and step progress for a flow. */
export function resetFlow(flowId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(flowSeenKey(flowId));
    localStorage.removeItem(flowProgressKey(flowId));
  } catch (error) {
    console.error(`[onboardingStorage] Error resetting flow "${flowId}":`, error);
  }
}

export function isOnboardingCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
  } catch (error) {
    console.error(
      "[onboardingStorage] Error marking onboarding as completed:",
      error,
    );
  }
}

export function resetOnboardingProgress(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  } catch (error) {
    console.error(
      "[onboardingStorage] Error resetting onboarding progress:",
      error,
    );
  }
}

export function hasShownToursTooltip(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(TOURS_TOOLTIP_KEY) === "true";
  } catch {
    return false;
  }
}

export function markToursTooltipShown(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOURS_TOOLTIP_KEY, "true");
  } catch (error) {
    console.error(
      "[onboardingStorage] Error marking tours tooltip as shown:",
      error,
    );
  }
}

export function migrateFromLegacyPreferences(): void {
  if (typeof window === "undefined") return;

  const migrationKey = `${STORAGE_PREFIX}::migrated`;

  try {
    // Skip if already migrated
    if (localStorage.getItem(migrationKey) === "true") return;

    const prefsRaw = localStorage.getItem("stirlingpdf_preferences");
    if (prefsRaw) {
      const prefs = JSON.parse(prefsRaw) as Record<string, unknown>;

      // If user had completed onboarding in old system, mark new system as complete
      if (
        prefs.hasCompletedOnboarding === true ||
        prefs.hasSeenIntroOnboarding === true
      ) {
        markOnboardingCompleted();
      }
    }

    // Mark migration complete
    localStorage.setItem(migrationKey, "true");
  } catch {
    // If migration fails, onboarding will show again - safer than hiding it
  }
}
