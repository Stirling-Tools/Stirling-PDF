import { useAuth } from "@editor/auth/UseSession";

export function useProfilePictureUrl(): string | null {
  return useAuth().profilePictureUrl;
}
