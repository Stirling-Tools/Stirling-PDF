/**
 * Whether a tool the backend can't serve should still open, rather than show
 * as disabled — its own run button then explains how to get access. Only the
 * desktop app does this (see its override); everywhere else unavailable tools
 * stay disabled.
 */
export function useUnavailableToolFallback(): boolean {
  return false;
}
