/**
 * Extension hook for platform-specific OAuth callback handling.
 * Proprietary/web builds are no-op.
 */
export async function handleAuthCallbackSuccess(_token: string): Promise<void> {
  // no-op for web builds
}
