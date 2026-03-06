import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { selfHostedServerMonitor } from '@app/services/selfHostedServerMonitor';
import type { GroupEnabledResult } from '@app/types/groupEnabled';

/**
 * Desktop override: skips the network request entirely when the self-hosted
 * server is confirmed offline, returning a reason string matching the tool panel.
 */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const { t } = useTranslation();
  // Initialise synchronously so the first render already reflects offline state —
  // avoids a flash where the option appears enabled before the effect runs.
  const [result, setResult] = useState<GroupEnabledResult>(() => {
    const { status } = selfHostedServerMonitor.getSnapshot();
    if (status === 'offline') {
      return { enabled: false, unavailableReason: null }; // reason set by effect once t() is available
    }
    return { enabled: null, unavailableReason: null };
  });

  useEffect(() => {
    const { status } = selfHostedServerMonitor.getSnapshot();
    if (status === 'offline') {
      setResult({
        enabled: false,
        unavailableReason: t('toolPanel.fullscreen.selfHostedOffline', 'Requires your Stirling-PDF server (currently offline)'),
      });
      return;
    }

    apiClient
      .get<boolean>(`/api/v1/config/group-enabled?group=${encodeURIComponent(group)}`)
      .then(res => setResult({ enabled: res.data, unavailableReason: null }))
      .catch(() => setResult({ enabled: false, unavailableReason: null }));
  }, [group, t]);

  return result;
}
