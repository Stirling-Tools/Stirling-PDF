/**
 * Extension hook for platform-specific OAuth navigation.
 * Proprietary/web builds default to in-window navigation.
 */
export async function startOAuthNavigation(_redirectUrl: string): Promise<boolean> {
  return false;
}
