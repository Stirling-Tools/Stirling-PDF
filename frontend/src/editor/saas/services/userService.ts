/**
 * User service for handling user-related API calls
 */

const API_BASE = "/api/v1";

/**
 * Synchronizes user upgrade from anonymous to authenticated status with the backend.
 * This should be called after Supabase has successfully upgraded the user.
 * Only the current user can upgrade their own account - the backend determines
 * the user from the security context and derives email from SupabaseUser.
 *
 * @param authMethod - The authentication method used (e.g., "email", "google", "github", "apple", "azure")
 * @returns Promise with the synchronization result
 */
export const synchronizeUserUpgrade = async (
  authMethod?: string,
): Promise<{
  message: string;
  userId: string;
  email: string;
}> => {
  const formData = new URLSearchParams();
  if (authMethod) {
    formData.append("authMethod", authMethod);
  }

  const response = await fetch(`${API_BASE}/user-role/promptToAuthUser`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    credentials: "include", // Include cookies for authentication
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to synchronize user upgrade" }));
    throw new Error(errorData.error || "Failed to synchronize user upgrade");
  }

  return response.json();
};
