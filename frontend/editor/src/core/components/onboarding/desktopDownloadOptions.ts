import { DOWNLOAD_URLS } from "@app/constants/downloads";
import type { OS } from "@app/hooks/useOs";
import type { OSOption } from "@app/components/onboarding/slides/DesktopInstallTitle";

export const DESKTOP_DOWNLOAD_OPTIONS: OSOption[] = [
  { label: "Windows", url: DOWNLOAD_URLS.WINDOWS, value: "windows" },
  { label: "Mac", url: DOWNLOAD_URLS.MAC, value: "mac" },
  { label: "Linux (.deb)", url: DOWNLOAD_URLS.LINUX_DEB, value: "linux-deb" },
  { label: "Linux (.rpm)", url: DOWNLOAD_URLS.LINUX_RPM, value: "linux-rpm" },
  {
    label: "Linux (AppImage)",
    url: DOWNLOAD_URLS.LINUX_APPIMAGE,
    value: "linux-appimage",
  },
];

/** The installer to offer first; empty label and url where we build none. */
export function desktopDownloadForOs(os: OS): { label: string; url: string } {
  switch (os) {
    case "windows":
      return { label: "Windows", url: DOWNLOAD_URLS.WINDOWS };
    case "mac":
      return { label: "Mac", url: DOWNLOAD_URLS.MAC };
    case "linux-x64":
    case "linux-arm64":
      return { label: "Linux (.deb)", url: DOWNLOAD_URLS.LINUX_DEB };
    default:
      return { label: "", url: "" };
  }
}
