import { useEffect, useState } from 'react';

export type OS =
  | 'windows'
  | 'mac-intel'
  | 'mac-apple'
  | 'linux-x64'
  | 'linux-arm64'
  | 'ios'
  | 'android'
  | 'unknown';

function parseUA(ua: string): OS {
  const uaLower = ua.toLowerCase();

  // iOS (includes iPadOS masquerading as Mac in some cases)
  const isIOS = /iphone|ipad|ipod/.test(uaLower) || (ua.includes('Macintosh') && typeof window !== 'undefined' && 'ontouchstart' in window);
  if (isIOS) return 'ios';

  if (/android/.test(uaLower)) return 'android';
  if (/windows nt/.test(uaLower)) return 'windows';
  if (/mac os x/.test(uaLower)) {
    // Default to Intel; refine via hints below
    let detected: OS = 'mac-intel';
    // Safari on Apple Silicon sometimes exposes both tokens
    if (ua.includes('Apple') && ua.includes('ARM')) {
      detected = 'mac-apple';
    }
    return detected; // will be further refined via Client Hints if available
  }
  if (/linux|x11/.test(uaLower)) return 'linux-x64';

  return 'unknown';
}

export function useOs(): OS {
  const [os, setOs] = useState<OS>('unknown');

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      // Start with UA fallback
      let detected: OS = parseUA(navigator.userAgent);

      // Try Client Hints for better platform + architecture
      const uaData = (navigator as any).userAgentData;
      if (uaData?.getHighEntropyValues) {
        try {
          const { platform, architecture, bitness } = await uaData.getHighEntropyValues([
            'platform',
            'architecture',
            'bitness',
            'platformVersion',
          ]);

          const plat = (platform || '').toLowerCase();
          if (plat.includes('windows')) detected = 'windows';
          else if (plat.includes('ios')) detected = 'ios';
          else if (plat.includes('android')) detected = 'android';
          else if (plat.includes('mac')) {
            // CH “architecture” is often "arm" on Apple Silicon
            detected = architecture?.toLowerCase().includes('arm') ? 'mac-apple' : 'mac-intel';
          } else if (plat.includes('linux') || plat.includes('chrome os')) {
            const archLower = (architecture || '').toLowerCase();
            const isArm = archLower.includes('arm') || (bitness === '32' && /aarch|arm/.test(architecture || ''));
            detected = isArm ? 'linux-arm64' : 'linux-x64';
          }
        } catch {
          // ignore
        }
      } else {
        // Heuristic Apple Silicon from UA when no Client Hints (Safari): uncertain, prefer not to guess
        // Keep detected as-is (often 'mac-intel').
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


