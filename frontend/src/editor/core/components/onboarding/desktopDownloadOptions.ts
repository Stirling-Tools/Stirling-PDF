import { DOWNLOAD_URLS } from "@editor/constants/downloads";
import type { OS } from "@editor/hooks/useOs";
import type { OSOption } from "@editor/components/onboarding/slides/DesktopInstallTitle";

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
  // No Arm build exists for Linux, so this option opens the install guide.
  { label: "Linux (Arm)", url: DOWNLOAD_URLS.LINUX_DOCS, value: "linux-arm" },
];

/**
 * The installer to offer first. Arm Linux has no build, so it gets the install
 * guide; platforms with neither get an empty label and url.
 */
export function desktopDownloadForOs(os: OS): { label: string; url: string } {
  switch (os) {
    case "windows":
      return { label: "Windows", url: DOWNLOAD_URLS.WINDOWS };
    case "mac":
      return { label: "Mac", url: DOWNLOAD_URLS.MAC };
    case "linux-x64":
      return { label: "Linux (.deb)", url: DOWNLOAD_URLS.LINUX_DEB };
    case "linux-arm64":
      return { label: "Linux (Arm)", url: DOWNLOAD_URLS.LINUX_DOCS };
    default:
      return { label: "", url: "" };
  }
}
