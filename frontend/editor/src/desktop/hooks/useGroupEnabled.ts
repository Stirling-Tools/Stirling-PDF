import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchGroupEnabled } from "@core/hooks/useGroupEnabled";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";
import type { GroupEnabledResult } from "@app/types/groupEnabled";

const OFFLINE_REASON_FALLBACK =
  "Requires your Stirling-PDF server (currently offline)";

/**
 * Desktop override: skips the network request entirely when the self-hosted
 * server is confirmed offline, returning a reason string matching the tool panel.
 *
 * The monitor snapshot is read during render (as before) rather than
 * subscribed to, so a server going offline mid-session doesn't retroactively
 * disable an already-rendered panel — same behaviour as the effect-based
 * version this replaces.
 */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const { t } = useTranslation();
  const isOffline = selfHostedServerMonitor.getSnapshot().status === "offline";

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
