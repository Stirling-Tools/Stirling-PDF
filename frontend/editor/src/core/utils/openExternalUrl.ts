const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function getExternalUrlBase(): string {
  if (typeof window !== "undefined" && window.location?.href) {
    return window.location.href;
  }
  return "http://localhost/";
}

export function toSafeExternalUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl, getExternalUrlBase());
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getExternalHref(rawUrl: string): string | null {
  return toSafeExternalUrl(rawUrl)?.href ?? null;
}

export async function openExternalUrl(rawUrl: string): Promise<boolean> {
  const safeUrl = toSafeExternalUrl(rawUrl);
  if (!safeUrl) {
    return false;
  }

  window.open(safeUrl.href, "_blank", "noopener,noreferrer");
  return true;
}
