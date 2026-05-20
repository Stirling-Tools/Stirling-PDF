/**
 * useOnboardingDownload Hook
 *
 * Encapsulates OS detection and download URL logic for the desktop install slide.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useOs } from "@app/hooks/useOs";
import { DOWNLOAD_URLS } from "@app/constants/downloads";

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

  const osInfo = useMemo<OsInfo>(() => {
    switch (osType) {
      case "windows":
        return { label: "Windows", url: DOWNLOAD_URLS.WINDOWS };
      case "mac":
        return { label: "Mac", url: DOWNLOAD_URLS.MAC };
      case "linux-x64":
      case "linux-arm64":
        return { label: "Linux", url: DOWNLOAD_URLS.LINUX_DOCS };
      default:
        return { label: "", url: "" };
    }
  }, [osType]);

  const osOptions = useMemo<OsOption[]>(
    () =>
      [
        { label: "Windows", url: DOWNLOAD_URLS.WINDOWS, value: "windows" },
        { label: "Mac", url: DOWNLOAD_URLS.MAC, value: "mac" },
        { label: "Linux", url: DOWNLOAD_URLS.LINUX_DOCS, value: "linux" },
      ].filter((opt) => opt.url),
    [],
  );

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
