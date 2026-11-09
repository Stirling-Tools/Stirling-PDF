import { useCallback, useEffect, useState } from "react";
import apiClient from "@editor/services/apiClient";

export interface McpGrant {
  id: number;
  clientId: string;
  clientName: string;
  scope?: string;
  createdAt?: string;
  lastUsedAt?: string | null;
}

const GRANTS_URL = "/api/v1/mcp/oauth/grants";

/** Apps this user connected through the built-in authorization server. */
export function useMcpGrants() {
  const [grants, setGrants] = useState<McpGrant[] | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [revokeFailed, setRevokeFailed] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiClient.get<McpGrant[]>(GRANTS_URL);
      setGrants(response.data ?? []);
    } catch {
      // A convenience list; failing to load it must not blank the guide.
      setGrants([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (id: number) => {
      setRevoking(id);
      setRevokeFailed(null);
      try {
        await apiClient.delete(`${GRANTS_URL}/${id}`, {
          suppressErrorToast: true,
        });
        await load();
      } catch {
        setRevokeFailed(id);
      } finally {
        setRevoking(null);
      }
    },
    [load],
  );

  return { grants, revoking, revokeFailed, revoke };
}
