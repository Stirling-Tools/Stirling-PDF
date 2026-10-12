import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { FrontendVersionInfo } from "@core/hooks/useFrontendVersionInfo";
import { useSaaSMode } from "@app/hooks/useSaaSMode";

export function useFrontendVersionInfo(
  backendVersion: string | undefined,
): FrontendVersionInfo {
  const isSaaSMode = useSaaSMode();
  const visibleBackendVersion = isSaaSMode ? undefined : backendVersion;
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [mismatchVersion, setMismatchVersion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchVersion = async () => {
      try {
        const version = await getVersion();
        if (!cancelled) {
          setAppVersion(version);
        }
      } catch (error) {
        console.error(
          "[useFrontendVersionInfo] Failed to fetch frontend version:",
          error,
        );
      }
    };
    fetchVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appVersion || !visibleBackendVersion) {
      setMismatchVersion(false);
      return;
    }
    if (appVersion !== visibleBackendVersion) {
      console.warn(
        "[useFrontendVersionInfo] Mismatch between frontend version and AppConfig version:",
        {
          backendVersion: visibleBackendVersion,
          frontendVersion: appVersion,
        },
      );
      setMismatchVersion(true);
    } else {
      setMismatchVersion(false);
    }
  }, [appVersion, visibleBackendVersion]);

  return {
    appVersion,
    backendVersion: visibleBackendVersion,
    mismatchVersion: Boolean(visibleBackendVersion) && mismatchVersion,
  };
}
