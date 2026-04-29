import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { FrontendVersionInfo } from "@core/hooks/useFrontendVersionInfo";

export function useFrontendVersionInfo(
  backendVersion: string | undefined,
): FrontendVersionInfo {
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
    if (!appVersion || !backendVersion) {
      setMismatchVersion(false);
      return;
    }
    if (appVersion !== backendVersion) {
      console.warn(
        "[useFrontendVersionInfo] Mismatch between frontend version and AppConfig version:",
        {
          backendVersion,
          frontendVersion: appVersion,
        },
      );
      setMismatchVersion(true);
    } else {
      setMismatchVersion(false);
    }
  }, [appVersion, backendVersion]);

  return { appVersion, mismatchVersion };
}
