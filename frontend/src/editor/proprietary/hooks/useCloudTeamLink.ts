import { useQuery } from "@tanstack/react-query";
import apiClient from "@editor/services/apiClient";
import { useAccountLinkOwner } from "@processor/hooks/useAccountLinkOwner";
import type { LinkStatus } from "@processor/api/link";
import {
  CLOUD_TEAM_PATH,
  cloudUrl,
} from "@processor/components/account-link/cloudLinks";

/**
 * Where a server linked with a key buys Team: the Team link on the Stirling Cloud it is linked to.
 * Nobody on such a server holds a cloud session, so the checkout here cannot take the payment.
 * Null for every other server, which keeps its own checkout.
 */
export function useCloudTeamLink(): string | null {
  const isOwner = useAccountLinkOwner();
  const { data } = useQuery({
    queryKey: ["accountLink", "editorStatus"],
    queryFn: async () => {
      const { data } = await apiClient.get<LinkStatus>(
        "/api/v1/account-link/status",
        { suppressErrorToast: true, skipAuthRedirect: true },
      );
      return data;
    },
    enabled: isOwner,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!isOwner || !data?.linked || data.linkMethod !== "KEY") return null;
  return cloudUrl(CLOUD_TEAM_PATH, data.cloudAppUrl);
}
