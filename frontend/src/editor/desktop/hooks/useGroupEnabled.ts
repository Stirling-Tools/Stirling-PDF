import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchGroupEnabled } from "@editor/api/config";
import { selfHostedServerMonitor } from "@editor/services/selfHostedServerMonitor";
import { qk } from "@editor/query/keys";
import { CONFIG_STALE_TIME } from "@editor/query/staleTime";
import type { GroupEnabledResult } from "@editor/types/groupEnabled";

const OFFLINE_REASON_FALLBACK =
  "Requires your Stirling-PDF server (currently offline)";

// A boolean, not the monitor's state object — that is reassigned every poll.
const subscribeToMonitor = (onChange: () => void) =>
  selfHostedServerMonitor.subscribe(onChange);
const getIsOffline = () =>
  selfHostedServerMonitor.getSnapshot().status === "offline";

/** Desktop override: skips the request when the self-hosted server is offline. */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const { t } = useTranslation();
  const isOffline = useSyncExternalStore(subscribeToMonitor, getIsOffline);

  const { data, isPending } = useQuery({
    queryKey: qk.groupEnabled(group),
    queryFn: () => fetchGroupEnabled(group),
    staleTime: CONFIG_STALE_TIME,
    enabled: !isOffline,
  });

  // Before the query: a disabled query stays isPending, which would read as loading forever.
  if (isOffline) {
    return {
      enabled: false,
      unavailableReason: t(
        "toolPanel.fullscreen.selfHostedOffline",
        OFFLINE_REASON_FALLBACK,
      ),
    };
  }

  return {
    enabled: isPending ? null : (data ?? false),
    unavailableReason: null,
  };
}
