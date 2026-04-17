import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import type { GroupEnabledResult } from "@app/types/groupEnabled";

const OFFLINE_REASON_FALLBACK =
  "Requires your Stirling-PDF server (currently offline)";

/**
 * Desktop override: skips the network request entirely when the self-hosted
 * server is confirmed offline, returning a reason string matching the tool panel.
 */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const { t } = useTranslation();
  // Initialise synchronously so the first render already reflects offline state —
  // avoids a flash where the option appears enabled before the effect runs.
  // Use OFFLINE_REASON_FALLBACK directly so unavailableReason is non-null from
  // the very first render when offline (t() is not available in useState initialiser).
  const [result, setResult] = useState<GroupEnabledResult>(() => {
    const { status } = selfHostedServerMonitor.getSnapshot();
    if (status === "offline") {
      return { enabled: false, unavailableReason: OFFLINE_REASON_FALLBACK };
    }
    return { enabled: null, unavailableReason: null };
  });

  useEffect(() => {
    const { status } = selfHostedServerMonitor.getSnapshot();
    if (status === "offline") {
      setResult({
        enabled: false,
        unavailableReason: t(
          "toolPanel.fullscreen.selfHostedOffline",
          OFFLINE_REASON_FALLBACK,
        ),
      });
      return;
    }

    apiClient
      .get<boolean>(
        `/api/v1/config/group-enabled?group=${encodeURIComponent(group)}`,
      )
      .then((res) => setResult({ enabled: res.data, unavailableReason: null }))
      .catch(() => setResult({ enabled: false, unavailableReason: null }));
  }, [group, t]);

  return result;
}
