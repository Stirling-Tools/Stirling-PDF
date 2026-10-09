import i18n from "@app/i18n";
import { connectionModeService } from "@app/services/connectionModeService";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";

/** These endpoints can send document data onward even from the bundled backend. */
export function requiresOffDeviceProcessing(endpoint: string): boolean {
  const path = decodeURIComponent(new URL(endpoint, "http://local").pathname);
  return (
    /^\/api\/v1\/(?:ai|storage|sharing|share|signing|workflow|policies|processing-folders|automation|pipeline|mobile-scanner)(?:\/|$)/.test(
      path,
    ) ||
    /^\/api\/v1\/security\/(?:timestamp-pdf(?:\/|$)|cert-sign\/)/.test(path)
  );
}

/** Capability names whose implementations need another device, regardless of local availability. */
export function isOffDeviceEndpointName(endpoint: string): boolean {
  return ["automate", "classify-and-label", "timestamp-pdf"].includes(endpoint);
}

/** A translated policy error shared by direct requests and stale UI actions. */
export function documentPrivacyError(): Error {
  return new Error(
    i18n.t(
      "desktopPrivacy.blocked",
      "Your administrator requires documents to stay on this device. This feature is unavailable.",
    ),
  );
}

/** Rejects if provisioning cannot be read; callers must never infer permission on failure. */
export async function isLocalProcessingOnly(): Promise<boolean> {
  return Boolean(
    (await connectionModeService.getCurrentConfig()).local_processing_only,
  );
}

function isWithinBase(url: URL, base: string): boolean {
  const parsed = new URL(base);
  const prefix = parsed.pathname.replace(/\/$/, "");
  return (
    url.origin === parsed.origin &&
    (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
  );
}

/** Checks the final destination, including absolute and signed URLs, before any body is sent.
 * Returns whether redirects must be disabled for the request. */
export async function enforceDocumentPrivacy(
  url: string,
  method: string,
  data?: unknown,
): Promise<boolean> {
  const config = await connectionModeService.getCurrentConfig();
  if (!config.local_processing_only) return false;
  const target = new URL(url);
  if (requiresOffDeviceProcessing(target.href)) throw documentPrivacyError();
  const localUrl = tauriBackendService.getBackendUrl();
  if (localUrl && isWithinBase(target, localUrl)) return true;

  // Only account APIs may leave the device. Unknown future APIs default to blocked.
  const trusted = [STIRLING_SAAS_BACKEND_API_URL, config.server_config?.url]
    .filter((base): base is string => Boolean(base))
    .some((base) => isWithinBase(target, base));
  const path = decodeURIComponent(target.pathname);
  const accountApi = /^\/api\/v1\/(?:auth|team|payg|user|admin)(?:\/|$)/.test(
    path,
  );
  const metadata =
    method === "GET" &&
    /^\/api\/v1\/(?:config|info|proprietary\/ui-data)(?:\/|$)/.test(path);
  const binaryBody =
    (data instanceof FormData &&
      [...data.values()].some((value) => value instanceof Blob)) ||
    data instanceof Blob ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data);
  if (!trusted || (!accountApi && !metadata) || binaryBody)
    throw documentPrivacyError();
  return true;
}
