/**
 * SaaS no-op: Supabase handles auth, no JWT event listener needed,
 * and config is fetched on all pages (401 handling covers unauthenticated state).
 */
export function useJwtConfigSync(_fetchConfig: (force?: boolean) => void): {
  isAuthPage: boolean;
} {
  return { isAuthPage: false };
}
