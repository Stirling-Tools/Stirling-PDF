// Decides whether `auto` mode should start in the browser or go straight to the server.
//
// Detection is ~15s per page in WASM against ~1.6s in Java, so a weak device is a genuinely bad
// place to run it. But pushing everyone to the server would put every page of every user's document
// through one backend, and give up the property that the PDF never leaves the device - so the bias
// is deliberately towards the browser. Only clearly-underpowered devices are sent to the server.

/** How long one page may take in the browser before `auto` gives up and uses the server. */
export const BROWSER_PAGE_BUDGET_MS = 20_000;

/**
 * What a device must report to keep detection local. Both are floors, not targets - a machine at
 * exactly 4/4 still runs in the browser.
 *
 * `deviceMemory` only ever reports 0.25/0.5/1/2/4/8 (Chromium caps it at 8 to limit fingerprinting),
 * so 4 is a real step on that scale rather than an arbitrary number.
 */
const MIN_CORES = 4;
const MIN_MEMORY_GB = 4;

interface CapabilityHints {
  cores?: number;
  memoryGb?: number;
}

function readHints(): CapabilityHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  // Both are advisory and capped by browsers; deviceMemory is Chromium-only and undefined
  // elsewhere, which must not read as "weak".
  return {
    cores:
      typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0
        ? nav.hardwareConcurrency
        : undefined,
    memoryGb:
      typeof nav.deviceMemory === "number" && nav.deviceMemory > 0
        ? nav.deviceMemory
        : undefined,
  };
}

/**
 * True when the device looks too weak to run detection locally in reasonable time. Conservative on
 * purpose: unknown means capable, so an unreported browser keeps the on-device path.
 */
export function isUnderpoweredForBrowserEngine(
  hints: CapabilityHints = readHints(),
): boolean {
  const { cores, memoryGb } = hints;
  if (cores !== undefined && cores < MIN_CORES) return true;
  if (memoryGb !== undefined && memoryGb < MIN_MEMORY_GB) return true;
  return false;
}

export function describeDevice(hints: CapabilityHints = readHints()): string {
  const parts: string[] = [];
  parts.push(
    hints.cores !== undefined ? `${hints.cores} cores` : "cores unknown",
  );
  parts.push(
    hints.memoryGb !== undefined ? `${hints.memoryGb}GB RAM` : "RAM unknown",
  );
  return parts.join(", ");
}
