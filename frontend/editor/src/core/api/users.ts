import apiClient from "@app/services/apiClient";
import { UserSummary } from "@app/types/signingSession";

export async function fetchUsers(): Promise<UserSummary[]> {
  const response = await apiClient.get<UserSummary[]>("/api/v1/user/users");
  // A proxy can answer 200 with an HTML login page; the callers filter/sort
  // this, so a non-array body would throw during render.
  return Array.isArray(response.data) ? response.data : [];
}
