import { tauriBackendService } from '@app/services/tauriBackendService';
import { fetch } from '@tauri-apps/plugin-http';

/**
 * Service for checking endpoint availability on the local bundled backend.
 * Used by operation router to determine if a tool should be routed to SaaS backend.
 *
 * Caches results to avoid repeated checks for the same endpoint.
 */
export class EndpointAvailabilityService {
  private cache: Map<string, boolean> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if local backend supports an endpoint
   * Returns cached result if available, otherwise fetches from backend
   *
   * @param endpoint - The endpoint path to check (e.g., "/api/v1/misc/compress-pdf")
   * @returns Promise<boolean> - true if supported locally, false otherwise
   */
  async isEndpointSupportedLocally(endpoint: string): Promise<boolean> {
    // Check cache first
    const cached = this.cache.get(endpoint);
    const expiry = this.cacheExpiry.get(endpoint);

    if (cached !== undefined && expiry && Date.now() < expiry) {
      console.debug(
        `[endpointAvailabilityService] Cache hit for ${endpoint}: ${cached}`
      );
      return cached;
    }

    // Fetch from backend
    try {
      const backendUrl = tauriBackendService.getBackendUrl();
      if (!backendUrl) {
        // Backend not started yet - assume not supported (will route to SaaS)
        console.debug(
          `[endpointAvailabilityService] Backend not started, assuming ${endpoint} not supported locally`
        );
        return false;
      }

      const url = `${backendUrl}/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpoint)}`;
      console.debug(`[endpointAvailabilityService] Checking endpoint availability: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-store',
        },
      });

      if (!response.ok) {
        console.warn(
          `[endpointAvailabilityService] Failed to check endpoint availability: ${response.status}`
        );
        return false;
      }

      const data = await response.json();
      const available = data[endpoint]?.enabled ?? false;

      console.debug(
        `[endpointAvailabilityService] Endpoint ${endpoint} supported locally: ${available}`
      );

      // Cache the result
      this.cache.set(endpoint, available);
      this.cacheExpiry.set(endpoint, Date.now() + this.CACHE_DURATION);

      return available;
    } catch (error) {
      console.error(
        `[endpointAvailabilityService] Error checking endpoint availability:`,
        error
      );
      return false; // Assume not supported on error
    }
  }

  /**
   * Clear cache (useful when backend restarts or connection mode changes)
   */
  clearCache() {
    console.debug('[endpointAvailabilityService] Clearing cache');
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Preload availability for multiple endpoints
   * Optimizes batch checking for tool initialization
   *
   * @param endpoints - Array of endpoint paths to check
   */
  async preloadEndpoints(endpoints: string[]): Promise<void> {
    const backendUrl = tauriBackendService.getBackendUrl();
    if (!backendUrl) {
      console.debug(
        '[endpointAvailabilityService] Backend not available, skipping preload'
      );
      return;
    }

    if (endpoints.length === 0) {
      return;
    }

    try {
      const endpointsParam = endpoints.join(',');
      const url = `${backendUrl}/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpointsParam)}`;

      console.debug(
        `[endpointAvailabilityService] Preloading ${endpoints.length} endpoints`
      );

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
          this.cache.set(endpoint, available);
          this.cacheExpiry.set(endpoint, now + this.CACHE_DURATION);
          console.debug(
            `[endpointAvailabilityService] Preloaded ${endpoint}: ${available}`
          );
        });

        console.debug(
          `[endpointAvailabilityService] Successfully preloaded ${Object.keys(data).length} endpoints`
        );
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
   * Get cache statistics (useful for debugging)
   */
  getCacheStats(): { size: number; entries: Array<{ endpoint: string; available: boolean; expiresIn: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([endpoint, available]) => {
      const expiry = this.cacheExpiry.get(endpoint) ?? 0;
      return {
        endpoint,
        available,
        expiresIn: Math.max(0, expiry - now),
      };
    });

    return {
      size: this.cache.size,
      entries,
    };
  }
}

// Export singleton instance
export const endpointAvailabilityService = new EndpointAvailabilityService();
