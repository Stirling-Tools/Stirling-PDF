import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchGroupEnabled } from "@app/api/config";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";
import type { GroupEnabledResult } from "@app/types/groupEnabled";

const OFFLINE_REASON_FALLBACK =
  "Requires your Stirling-PDF server (currently offline)";

// Selects a boolean, not the monitor's state object — that object is
// reassigned on every poll, so useSyncExternalStore would see a new snapshot
// each tick and re-render.
const subscribeToMonitor = (onChange: () => void) =>
  selfHostedServerMonitor.subscribe(onChange);
const getIsOffline = () =>
  selfHostedServerMonitor.getSnapshot().status === "offline";

/**
 * Desktop override: skips the network request entirely when the self-hosted
 * server is confirmed offline, returning a reason string matching the tool panel.
 */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const { t } = useTranslation();
  const isOffline = useSyncExternalStore(subscribeToMonitor, getIsOffline);

  const { data, isPending } = useQuery({
    queryKey: qk.groupEnabled(group),
    queryFn: () => fetchGroupEnabled(group),
    staleTime: CONFIG_STALE_TIME,
    enabled: !isOffline,
  });

  // Checked before the query result: a disabled query stays `isPending`, which
  // would otherwise read as "still loading" forever.
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
