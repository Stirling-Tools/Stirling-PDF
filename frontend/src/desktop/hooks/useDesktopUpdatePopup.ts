import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { updateService, UpdateSummary } from '@app/services/updateService';
import { useDesktopInstall } from '@app/hooks/useDesktopInstall';

const SNOOZE_KEY = 'stirling-pdf-updater:snoozedUntil';
const STARTUP_DELAY_MS = 15_000;

/**
 * Desktop-only hook that checks for updates on startup and
 * shows the UpdateModal as an auto-popup if an update is available.
 * Respects a 24-hour snooze set by the "Later" button.
 */
export function useDesktopUpdatePopup() {
  const [showModal, setShowModal] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(null);
  const install = useDesktopInstall();
  const hasChecked = useRef(false);

  // Startup check
  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    const timer = setTimeout(async () => {
      const snoozedUntil = localStorage.getItem(SNOOZE_KEY);
      if (snoozedUntil && Date.now() < parseInt(snoozedUntil, 10)) return;

      try {
        const version = await getVersion();
        setCurrentVersion(version);

        const machineInfo = { machineType: 'Client-win', activeSecurity: false, licenseType: 'NORMAL' };
        const summary = await updateService.getUpdateSummary(version, machineInfo);
        if (!summary?.latest_version || updateService.compareVersions(summary.latest_version, version) <= 0) return;

        setUpdateSummary(summary);
        await install.checkTauriUpdate();
        setShowModal(true);
      } catch (err) {
        console.error('[DesktopUpdatePopup] Startup check failed:', err);
      }
    }, STARTUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [install.checkTauriUpdate]);

  const dismissModal = useCallback(() => setShowModal(false), []);
  const remindLater = useCallback(() => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    setShowModal(false);
  }, []);

  return {
    state: { showModal, currentVersion, updateSummary, ...install },
    actions: { dismissModal, remindLater, ...install.actions },
  };
}
