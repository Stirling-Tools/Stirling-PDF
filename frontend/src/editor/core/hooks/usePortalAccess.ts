/**
 * Whether the current user can reach the processor. The one seam every
 * consumer asks, so the settings nav, the super search and the app switcher
 * can never disagree - each build answers it from whichever session actually
 * carries the flag.
 *
 * `settled` is false only while the answer is still being fetched: callers
 * that would act on "no access" (hiding a section, redirecting a deep link)
 * must wait for it rather than treat a pending lookup as a denial.
 *
 * Core ships no processor, so the answer is always no, and always settled.
 */
export interface PortalAccessState {
  granted: boolean;
  settled: boolean;
}

export function usePortalAccessState(): PortalAccessState {
  return { granted: false, settled: true };
}

export function usePortalAccess(): boolean {
  return usePortalAccessState().granted;
}
