import { useAuth } from "@app/auth/UseSession";

export function useProfilePictureUrl(): string | null {
  return useAuth().profilePictureUrl;
}

/** Whether the current user's initial picture lookup is still pending. */
export function useProfilePictureLoading(): boolean {
  return useAuth().profilePictureLoading;
}
