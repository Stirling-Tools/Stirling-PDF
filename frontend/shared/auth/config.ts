/**
 * Dependency injection seam for the shared Spring auth engine.
 *
 * The engine is created at import time (it starts a session-monitoring timer),
 * so configuration is read lazily through {@link getSpringAuthConfig}. Hosts
 * call {@link configureSpringAuth} once at startup:
 *
 * - Editor: injects its `@app/services/apiClient` plus a platform bridge built
 *   from its per-flavor `@app/extensions/*` seams, so desktop/saas behaviour is
 *   unchanged.
 * - Portal: relies on the web defaults below (same-origin transport + no-op
 *   platform bridge).
 */
import type { AxiosInstance } from "axios";
import { createDefaultHttpClient } from "@shared/auth/httpClient";
import {
  defaultPlatformBridge,
  type PlatformBridge,
} from "@shared/auth/spring/platformBridge";

export interface SpringAuthConfig {
  /** Axios instance used for all /api/v1/auth + /api/v1/user calls. */
  http: AxiosInstance;
  /** App base path (subpath deploys); used to build OAuth redirect targets. */
  basePath: string;
  /** Platform seam (web no-op by default; desktop injects Tauri behaviour). */
  platform: PlatformBridge;
}

let config: SpringAuthConfig | null = null;

export function getSpringAuthConfig(): SpringAuthConfig {
  if (!config) {
    config = {
      http: createDefaultHttpClient(),
      basePath: "",
      platform: defaultPlatformBridge,
    };
  }
  return config;
}

/**
 * Configure the shared Spring auth engine. Any field left undefined keeps its
 * current (or default) value, so hosts can configure incrementally.
 */
export function configureSpringAuth(partial: Partial<SpringAuthConfig>): void {
  const current = getSpringAuthConfig();
  config = {
    http: partial.http ?? current.http,
    basePath: partial.basePath ?? current.basePath,
    platform: partial.platform ?? current.platform,
  };
}
