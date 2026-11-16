/**
 * Extension hooks for platform-specific auth cleanup.
 * Proprietary/web builds are no-op.
 */
export async function clearPlatformAuthAfterSignOut(): Promise<void> {
  // no-op for web builds
}

export async function clearPlatformAuthOnLoginInit(): Promise<void> {
  // no-op for web builds
}
