/**
 * Core stub — whether policy enforcement is active for this build. Gates
 * mounting the headless PolicyAutoRunController. Always false in core; the
 * proprietary and desktop builds shadow this via the {@code @app/*} alias.
 */
export function usePoliciesEnabled(): boolean {
  return false;
}
