import { fetch } from "@tauri-apps/plugin-http";
import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";
import { connectionModeService } from "@app/services/connectionModeService";
import type { AppConfig } from "@app/types/appConfig";

/**
 * General fetch+cache of the SaaS backend's app-config for the desktop app.
 *
 * The local AppConfigContext reads /api/v1/config/app-config from the LOCAL
 * bundled backend (that's what apiClient routes to on desktop), so cloud-only
 * feature flags (aiEngineEnabled, premiumEnabled, paygEnabled, ...) are never
 * seen. This service fetches the SAME endpoint from the SaaS backend so desktop
 * SaaS mode can read the cloud's view of those flags. It is intentionally
 * generic — not AI-specific — so other desktop SaaS features can consume it.
 *
 * - Only returns config in SaaS connection mode; null in local/self-hosted (so
 *   callers naturally treat cloud features as off outside SaaS, and a server-side
 *   flag flip — e.g. turning AI off — propagates without a desktop release).
 * - The endpoint is public on the SaaS backend (/api/v1/config/** is permitAll),
 *   so no auth is required.
 * - Native HTTP (@tauri-apps/plugin-http) — no CORS, mirrors endpointAvailabilityService.
 */
const CACHE_MS = 5 * 60 * 1000;

class SaasAppConfigService {
  private cache: AppConfig | null = null;
  private cacheExpiry = 0;
  private inFlight: Promise<AppConfig | null> | null = null;

  /** The SaaS backend's app-config, or null outside SaaS mode / on failure. */
  async getConfig(force = false): Promise<AppConfig | null> {
    const mode = await connectionModeService.getCurrentMode();
    if (mode !== "saas" || !STIRLING_SAAS_BACKEND_API_URL) {
      this.clearCache();
      return null;
    }
    if (!force && this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchConfig();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchConfig(): Promise<AppConfig | null> {
    try {
      const base = STIRLING_SAAS_BACKEND_API_URL.replace(/\/$/, "");
      const response = await fetch(`${base}/api/v1/config/app-config`, {
        method: "GET",
        headers: { "Cache-Control": "no-store" },
      });
      if (!response.ok) {
        console.warn(
          `[saasAppConfigService] SaaS app-config fetch failed: ${response.status}`,
        );
        return null;
      }
      const data = (await response.json()) as AppConfig;
      this.cache = data;
      this.cacheExpiry = Date.now() + CACHE_MS;
      return data;
    } catch (error) {
      console.error(
        "[saasAppConfigService] SaaS app-config fetch error:",
        error,
      );
      return null;
    }
  }

  /** Drop the cache (e.g. on connection-mode change) so the next read re-fetches. */
  clearCache(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }
}

export const saasAppConfigService = new SaasAppConfigService();
