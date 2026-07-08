import { getStoredToken } from "@app/auth";

/**
 * Self-hosted build: the local Stirling backend authenticates with the Spring
 * bearer (`stirling_jwt`). Same token the editor's proprietary apiClient uses.
 */
export async function getBackendToken(): Promise<string | null> {
  return getStoredToken();
}
