import { DOWNLOAD_URLS } from "@app/constants/downloads";

export type DesktopPlatform = "mac" | "windows" | "linux";

export type DesktopTargetId =
  | "mac"
  | "windowsX64"
  | "windowsArm64"
  | "linuxDeb"
  | "linuxRpm"
  | "linuxAppImage";

export interface DesktopTarget {
  id: DesktopTargetId;
  platform: DesktopPlatform;
  url: string;
}

export const DESKTOP_TARGETS: readonly DesktopTarget[] = [
  { id: "mac", platform: "mac", url: DOWNLOAD_URLS.MAC },
  {
    id: "windowsX64",
    platform: "windows",
    url: DOWNLOAD_URLS.WINDOWS,
  },
  {
    id: "windowsArm64",
    platform: "windows",
    url: DOWNLOAD_URLS.WINDOWS_ARM64,
  },
  { id: "linuxDeb", platform: "linux", url: DOWNLOAD_URLS.LINUX_DEB },
  { id: "linuxRpm", platform: "linux", url: DOWNLOAD_URLS.LINUX_RPM },
  {
    id: "linuxAppImage",
    platform: "linux",
    url: DOWNLOAD_URLS.LINUX_APPIMAGE,
  },
];

export function getDesktopTarget(id: DesktopTargetId): DesktopTarget {
  const target = DESKTOP_TARGETS.find((t) => t.id === id);
  if (!target) throw new Error(`Unknown desktop target: ${id}`);
  return target;
}

export interface PlatformHints {
  platform?: string;
  architecture?: string;
}

/**
 * Best guess at the installer for this machine. Client hints are the only
 * source of the CPU architecture, so without them Windows defaults to x64, the
 * common case. Phones and unknown platforms fall back to the Mac build.
 */
export function pickDesktopTarget(
  userAgent: string,
  hints: PlatformHints = {},
): DesktopTargetId {
  const platform = (hints.platform ?? "").toLowerCase();
  const ua = userAgent.toLowerCase();
  const isArm = (hints.architecture ?? "").toLowerCase().includes("arm");

  if (
    platform.includes("windows") ||
    (!platform && ua.includes("windows nt"))
  ) {
    return isArm ? "windowsArm64" : "windowsX64";
  }
  if (platform.includes("linux") || platform.includes("chrome os")) {
    return "linuxDeb";
  }
  if (!platform && /linux|x11/.test(ua) && !ua.includes("android")) {
    return "linuxDeb";
  }
  return "mac";
}

interface UserAgentDataLike {
  getHighEntropyValues(hints: string[]): Promise<PlatformHints>;
}

export async function detectDesktopTarget(): Promise<DesktopTargetId> {
  const uaData = (
    navigator as Navigator & { userAgentData?: UserAgentDataLike }
  ).userAgentData;
  let hints: PlatformHints = {};
  if (uaData?.getHighEntropyValues) {
    try {
      hints = await uaData.getHighEntropyValues(["platform", "architecture"]);
    } catch {
      // Hints are an optional refinement; the user agent alone still works.
    }
  }
  return pickDesktopTarget(navigator.userAgent, hints);
}
