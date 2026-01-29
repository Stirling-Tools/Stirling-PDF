import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useAppConfig } from '@app/contexts/AppConfigContext';

export function useVersionInfo() {
  const { config } = useAppConfig();
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDesktopVersion = async () => {
      try {
        const version = await getVersion();
        setDesktopVersion(version);
      } catch (error) {
        console.error('[useVersionInfo] Failed to fetch desktop version:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchDesktopVersion();
  }, []);

  return {
    desktopVersion,
    serverVersion: config?.appVersion || null,
    loading: loading || !config,
  };
}
