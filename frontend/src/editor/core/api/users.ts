import apiClient from "@editor/services/apiClient";
import { UserSummary } from "@editor/types/signingSession";

export async function fetchUsers(): Promise<UserSummary[]> {
  const response = await apiClient.get<UserSummary[]>("/api/v1/user/users");
  // A proxy can answer 200 with an HTML login page; callers assume an array.
  return Array.isArray(response.data) ? response.data : [];
}
