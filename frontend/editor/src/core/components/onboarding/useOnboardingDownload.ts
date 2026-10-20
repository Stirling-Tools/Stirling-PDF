/**
 * useOnboardingDownload Hook
 *
 * Encapsulates OS detection and download URL logic for the desktop install slide.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useOs } from "@app/hooks/useOs";
import {
  DESKTOP_DOWNLOAD_OPTIONS,
  desktopDownloadForOs,
} from "@app/components/onboarding/desktopDownloadOptions";

interface OsInfo {
  label: string;
  url: string;
}

interface OsOption {
  label: string;
  url: string;
  value: string;
}

interface UseOnboardingDownloadResult {
  osInfo: OsInfo;
  osOptions: OsOption[];
  selectedDownloadUrl: string;
  setSelectedDownloadUrl: (url: string) => void;
  handleDownloadSelected: () => void;
}

export function useOnboardingDownload(): UseOnboardingDownloadResult {
  const osType = useOs();
  const [selectedDownloadUrl, setSelectedDownloadUrl] = useState<string>("");

  const osInfo = useMemo<OsInfo>(() => desktopDownloadForOs(osType), [osType]);
  const osOptions: OsOption[] = DESKTOP_DOWNLOAD_OPTIONS;

  // Initialize selected URL from detected OS
  useEffect(() => {
    if (!selectedDownloadUrl && osInfo.url) {
      setSelectedDownloadUrl(osInfo.url);
    }
  }, [osInfo.url, selectedDownloadUrl]);

  const handleDownloadSelected = useCallback(() => {
    const downloadUrl = selectedDownloadUrl || osInfo.url;
    if (downloadUrl) {
      window.open(downloadUrl, "_blank", "noopener");
    }
  }, [selectedDownloadUrl, osInfo.url]);

  return {
    osInfo,
    osOptions,
    selectedDownloadUrl,
    setSelectedDownloadUrl,
    handleDownloadSelected,
  };
}
