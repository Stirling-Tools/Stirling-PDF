import { fetch } from '@tauri-apps/plugin-http';
import { STIRLING_SAAS_BACKEND_API_URL } from '@app/constants/connection';

/**
 * Service for checking endpoint availability on the local bundled backend.
 * Used by operation router to determine if a tool should be routed to SaaS backend.
 *
 * Caches results to avoid repeated checks for the same endpoint.
 */
export class EndpointAvailabilityService {
  private localCache: Map<string, boolean> = new Map();
  private localCacheExpiry: Map<string, number> = new Map();
  private saasCache: Map<string, boolean> = new Map();
  private saasCacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if local backend supports an endpoint
   * Returns cached result if available, otherwise fetches from backend
   *
   * @param endpoint - The endpoint path to check (e.g., "/api/v1/misc/compress-pdf")
   * @param backendUrl - The URL for the backend
   * @returns Promise<boolean> - true if supported locally, false otherwise
   */
  async isEndpointSupportedLocally(endpoint: string, backendUrl: string | null): Promise<boolean> {
    // Check cache first
    const cached = this.localCache.get(endpoint);
    const expiry = this.localCacheExpiry.get(endpoint);

    if (cached !== undefined && expiry && Date.now() < expiry) {
      return cached;
    }

    // Fetch from backend
    try {
      if (!backendUrl) {
        // Backend not started yet - assume not supported (will route to SaaS)
        return false;
      }

      const url = `${backendUrl}/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpoint)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-store',
        },
      });

      if (!response.ok) {
        console.warn(
          `[endpointAvailabilityService] Failed to check local endpoint availability: ${response.status}`
        );
        return false;
      }

      const data = await response.json();
      const available = data[endpoint]?.enabled ?? false;

      // Cache the result
      this.localCache.set(endpoint, available);
      this.localCacheExpiry.set(endpoint, Date.now() + this.CACHE_DURATION);

      return available;
    } catch (error) {
      console.error(
        `[endpointAvailabilityService] Error checking local endpoint availability:`,
        error
      );
      return false; // Assume not supported on error
    }
  }

  /**
   * Check if SaaS backend supports an endpoint
   * Returns cached result if available, otherwise fetches from SaaS backend
   *
   * @param endpoint - The endpoint path to check (e.g., "/api/v1/misc/compress-pdf")
   * @returns Promise<boolean> - true if supported on SaaS, false otherwise
   */
  async isEndpointSupportedOnSaaS(endpoint: string): Promise<boolean> {
    // Check cache first
    const cached = this.saasCache.get(endpoint);
    const expiry = this.saasCacheExpiry.get(endpoint);

    if (cached !== undefined && expiry && Date.now() < expiry) {
      return cached;
    }

    // Fetch from SaaS backend
    try {
      if (!STIRLING_SAAS_BACKEND_API_URL) {
        return false;
      }

      const saasUrl = STIRLING_SAAS_BACKEND_API_URL.replace(/\/$/, '');
      const url = `${saasUrl}/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpoint)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-store',
        },
      });

      if (!response.ok) {
        console.warn(
          `[endpointAvailabilityService] Failed to check SaaS endpoint availability: ${response.status}`
        );
        return false;
      }

      const data = await response.json();
      const available = data[endpoint]?.enabled ?? false;

      // Cache the result
      this.saasCache.set(endpoint, available);
      this.saasCacheExpiry.set(endpoint, Date.now() + this.CACHE_DURATION);

      return available;
    } catch (error) {
      console.error(
        `[endpointAvailabilityService] Error checking SaaS endpoint availability:`,
        error
      );
      return false; // Assume not supported on error
    }
  }

  /**
   * Clear cache (useful when backend restarts or connection mode changes)
   */
  clearCache() {
    this.localCache.clear();
    this.localCacheExpiry.clear();
    this.saasCache.clear();
    this.saasCacheExpiry.clear();
  }

  /**
   * Debug: Log all cached endpoint availability
   * Call from console: window.endpointAvailabilityService.debugCache()
   */
  debugCache() {
    console.group('[endpointAvailabilityService] Cache Debug');

    console.group('Local Cache');
    this.localCache.forEach((available, endpoint) => {
      const expiry = this.localCacheExpiry.get(endpoint);
      const expiresIn = expiry ? Math.max(0, expiry - Date.now()) : 0;
      console.log(`${endpoint}: ${available} (expires in ${Math.round(expiresIn / 1000)}s)`);
    });
    console.groupEnd();

    console.group('SaaS Cache');
    this.saasCache.forEach((available, endpoint) => {
      const expiry = this.saasCacheExpiry.get(endpoint);
      const expiresIn = expiry ? Math.max(0, expiry - Date.now()) : 0;
      console.log(`${endpoint}: ${available} (expires in ${Math.round(expiresIn / 1000)}s)`);
    });
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Preload availability for multiple endpoints
   * Optimizes batch checking for tool initialization
   *
   * @param endpoints - Array of endpoint paths to check
   * @param backendUrl - The URL of the backend
   */
  async preloadEndpoints(endpoints: string[], backendUrl: string | null): Promise<void> {
    if (!backendUrl || endpoints.length === 0) {
      return;
    }

    try {
      const endpointsParam = endpoints.join(',');
      const url = `${backendUrl}/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpointsParam)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-store',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const now = Date.now();

        Object.entries(data).forEach(([endpoint, details]: [string, any]) => {
          const available = details?.enabled ?? false;
          this.localCache.set(endpoint, available);
          this.localCacheExpiry.set(endpoint, now + this.CACHE_DURATION);
        });
      } else {
        console.warn(
          `[endpointAvailabilityService] Failed to preload endpoints: ${response.status}`
        );
      }
    } catch (error) {
      console.error('[endpointAvailabilityService] Error preloading endpoints:', error);
    }
  }

  /**
   * Check endpoint availability across both local and SaaS backends
   * Returns comprehensive status for decision making
   *
   * @param endpoint - The endpoint path to check
   * @returns Promise with availability details
   */
  async checkEndpointCombined(endpoint: string, backendUrl: string | null): Promise<{
    availableLocally: boolean;
    availableOnSaaS: boolean;
    isAvailable: boolean;      // local || saas
    willUseCloud: boolean;      // saas && !local
    localOnly: boolean;         // local && !saas
  }> {
    // Check both backends in parallel for efficiency
    const [availableLocally, availableOnSaaS] = await Promise.all([
      this.isEndpointSupportedLocally(endpoint, backendUrl),
      this.isEndpointSupportedOnSaaS(endpoint),
    ]);

    return {
      availableLocally,
      availableOnSaaS,
      isAvailable: availableLocally || availableOnSaaS,
      willUseCloud: availableOnSaaS && !availableLocally,
      localOnly: availableLocally && !availableOnSaaS,
    };
  }

  /**
   * Get cache statistics (useful for debugging)
   */
  getCacheStats(): {
    local: { size: number; entries: Array<{ endpoint: string; available: boolean; expiresIn: number }> };
    saas: { size: number; entries: Array<{ endpoint: string; available: boolean; expiresIn: number }> };
  } {
    const now = Date.now();

    const localEntries = Array.from(this.localCache.entries()).map(([endpoint, available]) => {
      const expiry = this.localCacheExpiry.get(endpoint) ?? 0;
      return {
        endpoint,
        available,
        expiresIn: Math.max(0, expiry - now),
      };
    });

    const saasEntries = Array.from(this.saasCache.entries()).map(([endpoint, available]) => {
      const expiry = this.saasCacheExpiry.get(endpoint) ?? 0;
      return {
        endpoint,
        available,
        expiresIn: Math.max(0, expiry - now),
      };
    });

    return {
      local: {
        size: this.localCache.size,
        entries: localEntries,
      },
      saas: {
        size: this.saasCache.size,
        entries: saasEntries,
      },
    };
  }
}

// Export singleton instance
export const endpointAvailabilityService = new EndpointAvailabilityService();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).endpointAvailabilityService = endpointAvailabilityService;
}
