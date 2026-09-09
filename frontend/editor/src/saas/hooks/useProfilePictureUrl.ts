import { useAuth } from "@app/auth/UseSession";

export function useProfilePictureUrl(): string | null {
  return useAuth().profilePictureUrl;
}
