/**
 * Core stub — no profile picture source; auth-aware layers override this.
 */
export function useProfilePictureUrl(): string | null {
  return null;
}

/** Whether the current user's initial picture lookup is still pending. */
export function useProfilePictureLoading(): boolean {
  return false;
}
