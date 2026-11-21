import { fetch } from "@tauri-apps/plugin-http";
import { tauriBackendService } from "@editor/services/tauriBackendService";

type CapabilityMap = Record<string, boolean>;

interface CapabilityEntry {
  backendUrl: string;
  expiresAt: number;
  capabilities: Promise<CapabilityMap>;
}

async function fetchLocalCapabilities(
  backendUrl: string,
): Promise<CapabilityMap> {
  const response = await fetch(
    `${backendUrl.replace(/\/$/, "")}/api/v1/config/endpoints-availability`,
    { method: "GET", headers: { "Cache-Control": "no-store" } },
  );
  if (!response.ok) {
    throw new Error(`Local capability check failed: ${response.status}`);
  }
  const data = (await response.json()) as Record<
    string,
    { enabled?: boolean } | null
  >;
  const capabilities: CapabilityMap = {};
  for (const [endpoint, details] of Object.entries(data)) {
    capabilities[endpoint] = details?.enabled ?? false;
  }
  return capabilities;
}

export class EndpointAvailabilityService {
  private local: CapabilityEntry | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private localCapabilities(backendUrl: string): Promise<CapabilityMap> {
    const now = Date.now();
    if (
      this.local &&
      this.local.backendUrl === backendUrl &&
      now < this.local.expiresAt
    ) {
      return this.local.capabilities;
    }
    const capabilities = fetchLocalCapabilities(backendUrl);
    if (!tauriBackendService.isOnline) return capabilities;
    const entry: CapabilityEntry = {
      backendUrl,
      expiresAt: now + this.CACHE_DURATION,
      capabilities,
    };
    this.local = entry;
    entry.capabilities.catch(() => {
      if (this.local === entry) this.local = null;
    });
    return entry.capabilities;
  }

  async isEndpointSupportedLocally(
    endpoint: string,
    backendUrl: string | null,
  ): Promise<boolean> {
    if (!backendUrl) return false;
    try {
      return (await this.localCapabilities(backendUrl))[endpoint] ?? false;
    } catch (error) {
      console.error(
        "[endpointAvailabilityService] Error checking local endpoint availability:",
        error,
      );
      return false;
    }
  }

  preloadLocalCapabilities(backendUrl: string | null): void {
    if (!backendUrl) return;
    this.localCapabilities(backendUrl).catch(() => {});
  }
}

export const endpointAvailabilityService = new EndpointAvailabilityService();

if (typeof window !== "undefined") {
  window.endpointAvailabilityService = endpointAvailabilityService;
}
