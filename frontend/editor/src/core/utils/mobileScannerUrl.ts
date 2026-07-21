/**
 * Build the URL a phone opens (via the QR code) to reach the SPA's
 * `/mobile-scanner` route.
 *
 * That route is a public, top-level route. It lives under the app's base path,
 * which is the router's `basename`. If the generated URL omits the base path,
 * the phone loads a path the router can't match, falls through to the
 * auth-gated catch-all route, and gets bounced to the login page. So the base
 * path must always be present.
 *
 * A configured `server_url`/`frontendUrl` supplies the host the phone should
 * reach (desktop / LAN / reverse proxy):
 *   - origin only (no subpath): apply the app's base path. The backend's
 *     `resolveFrontendUrl` advertises a bare origin with no subpath, so this is
 *     the common SaaS web case (frontend served under e.g. `/app`).
 *   - already carries a subpath: it points at the target SPA's base directly,
 *     so use it verbatim and do not add the base path again (no doubled base).
 *
 * With no usable configured URL, fall back to the current origin + base path.
 */
export function buildMobileScannerUrl(params: {
  configuredUrl: string;
  sessionId: string;
  origin: string;
  basePath: string;
}): string {
  const { configuredUrl, sessionId, origin, basePath } = params;
  const query = `?session=${sessionId}`;
  const route = `${basePath}/mobile-scanner`;

  const trimmed = configuredUrl.trim();
  if (trimmed) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        const subpath = parsed.pathname.replace(/\/+$/, "");
        return subpath
          ? `${parsed.origin}${subpath}/mobile-scanner${query}`
          : `${parsed.origin}${route}${query}`;
      }
    } catch {
      // invalid configured URL — fall through to the current-origin default
    }
  }

  return `${origin}${route}${query}`;
}
