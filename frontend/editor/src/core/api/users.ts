import apiClient from "@app/services/apiClient";
import { UserSummary } from "@app/types/signingSession";

export async function fetchUsers(): Promise<UserSummary[]> {
  // UserSelector raises its own error toast.
  const response = await apiClient.get<UserSummary[]>("/api/v1/user/users", {
    suppressErrorToast: true,
  });
  // A proxy can answer 200 with an HTML login page; callers assume an array.
  return Array.isArray(response.data) ? response.data : [];
}
