const HARDWARE_CERT_TYPES = new Set([
  "WINDOWS_STORE",
  "MACOS_KEYCHAIN",
  "PKCS11",
]);
const HARDWARE_DISCOVERY_PATH = /^\/api\/v1\/security\/cert-sign\/hardware\//;
const CERT_SIGN_PATH = "/api/v1/security/cert-sign";

/**
 * Requests that touch this device's certificate stores or tokens. They carry a token PIN and only
 * the bundled backend can serve them, so they must never fall through to a remote server.
 */
export function requiresBundledBackend(
  url: string | undefined,
  data: unknown,
): boolean {
  if (!url) return false;
  const path = url.split("?")[0];
  if (HARDWARE_DISCOVERY_PATH.test(path)) return true;
  return (
    path === CERT_SIGN_PATH &&
    data instanceof FormData &&
    HARDWARE_CERT_TYPES.has(String(data.get("certType")))
  );
}
