import { useEffect, useState } from "react";

export type OS =
  | "windows"
  | "mac"
  | "linux-x64"
  | "linux-arm64"
  | "ios"
  | "android"
  | "unknown";

function parseUA(ua: string): OS {
  const uaLower = ua.toLowerCase();

  // iOS (includes iPadOS masquerading as Mac in some cases)
  const isIOS =
    /iphone|ipad|ipod/.test(uaLower) ||
    (ua.includes("Macintosh") &&
      typeof window !== "undefined" &&
      "ontouchstart" in window);
  if (isIOS) return "ios";

  if (/android/.test(uaLower)) return "android";
  if (/windows nt/.test(uaLower)) return "windows";
  if (/mac os x/.test(uaLower)) return "mac";
  if (/linux|x11/.test(uaLower)) return "linux-x64";

  return "unknown";
}

export function useOs(): OS {
  const [os, setOs] = useState<OS>("unknown");

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      // Start with UA fallback
      let detected: OS = parseUA(navigator.userAgent);

      // Try Client Hints for better platform + architecture
      const uaData = (navigator as any).userAgentData;
      if (uaData?.getHighEntropyValues) {
        try {
          const { platform, architecture, bitness } =
            await uaData.getHighEntropyValues([
              "platform",
              "architecture",
              "bitness",
              "platformVersion",
            ]);

          const plat = (platform || "").toLowerCase();
          if (plat.includes("windows")) detected = "windows";
          else if (plat.includes("ios")) detected = "ios";
          else if (plat.includes("android")) detected = "android";
          else if (plat.includes("mac")) {
            detected = "mac";
          } else if (plat.includes("linux") || plat.includes("chrome os")) {
            const archLower = (architecture || "").toLowerCase();
            const isArm =
              archLower.includes("arm") ||
              (bitness === "32" && /aarch|arm/.test(architecture || ""));
            detected = isArm ? "linux-arm64" : "linux-x64";
          }
        } catch {
          // ignore
        }
      }

      if (!cancelled) setOs(detected);
    }

    detect();
    return () => {
      cancelled = true;
    };
  }, []);

  return os;
}
