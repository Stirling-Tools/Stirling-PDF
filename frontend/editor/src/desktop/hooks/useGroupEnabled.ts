import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import type { GroupEnabledResult } from "@app/types/groupEnabled";
import { editorQk } from "@app/queries/keys";
import { fetchGroupEnabled } from "@app/queries/endpoints";

const OFFLINE_REASON_FALLBACK =
  "Requires your Stirling-PDF server (currently offline)";

/**
 * Desktop override: skips the network request entirely when the self-hosted
 * server is confirmed offline, returning a reason string matching the tool panel.
 */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const { t } = useTranslation();
  const serverStatus = useSyncExternalStore(
    selfHostedServerMonitor.subscribe,
    selfHostedServerMonitor.getSnapshot,
  ).status;
  const isOffline = serverStatus === "offline";

  const query = useQuery({
    queryKey: editorQk.groupEnabled(group),
    queryFn: () => fetchGroupEnabled(group),
    enabled: !!group && !isOffline,
  });

  if (!group) return { enabled: null, unavailableReason: null };

  if (isOffline) {
    return {
      enabled: false,
      unavailableReason: t(
        "toolPanel.fullscreen.selfHostedOffline",
        OFFLINE_REASON_FALLBACK,
      ),
    };
  }

  if (query.isPending) return { enabled: null, unavailableReason: null };
  if (query.isError) return { enabled: false, unavailableReason: null };
  return { enabled: query.data ?? false, unavailableReason: null };
}
