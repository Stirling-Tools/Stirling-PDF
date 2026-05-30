import i18n from "@app/i18n";
import { connectionModeService } from "@app/services/connectionModeService";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";
import {
  CONVERSION_ENDPOINTS,
  ENDPOINT_NAMES,
} from "@app/constants/convertConstants";

export type ExecutionTarget = "local" | "remote";

export class OperationRouter {
  private static instance: OperationRouter;

  static getInstance(): OperationRouter {
    if (!OperationRouter.instance) {
      OperationRouter.instance = new OperationRouter();
    }
    return OperationRouter.instance;
  }

  /**
   * Determines where an operation should execute
   * @param _operation - The operation name (for future operation classification)
   * @returns 'local' or 'remote'
   */
  async getExecutionTarget(_operation?: string): Promise<ExecutionTarget> {
    const mode = await connectionModeService.getCurrentMode();

    // Current implementation: simple mode-based routing
    if (mode === "saas" || mode === "local") {
      return "local";
    }

    // In self-hosted mode, currently all operations go to remote
    // Future enhancement: check if operation is "simple" and route to local if so
    // Example future logic:
    // if (mode === 'selfhosted' && operation && this.isSimpleOperation(operation)) {
    //   return 'local';
    // }

    return "remote";
  }

  /**
   * Check if endpoint should route to SaaS backend (not local)
   * @param endpoint - The endpoint path to check
   * @returns true if endpoint should route to SaaS backend
   */
  private isSaaSBackendEndpoint(endpoint?: string): boolean {
    if (!endpoint) return false;

    const saasBackendPatterns = [
      /^\/api\/v1\/team\//, // Team endpoints
      /^\/api\/v1\/auth\//, // Auth endpoints (Supabase auth in SaaS mode)
      // Add more SaaS-specific patterns here as needed
    ];

    return saasBackendPatterns.some((pattern) => pattern.test(endpoint));
  }

  /**
   * Check if endpoint is a tool endpoint (vs team/admin/config endpoints)
   * @param endpoint - The endpoint path to check
   * @returns true if endpoint is a tool endpoint
   */
  private isToolEndpoint(endpoint: string): boolean {
    const toolPatterns = [
      /^\/api\/v1\/general\//,
      /^\/api\/v1\/convert\//,
      /^\/api\/v1\/misc\//,
      /^\/api\/v1\/security\//,
      /^\/api\/v1\/filter\//,
      /^\/api\/v1\/multi-tool\//,
      /^\/api\/v1\/ui-data\//, // UI data endpoints for tools (e.g., OCR languages)
    ];

    return toolPatterns.some((pattern) => pattern.test(endpoint));
  }

  /**
   * Extract endpoint name from endpoint path
   * @param endpoint - The endpoint path
   * @returns Endpoint name for backend capability checks
   *
   * Examples:
   * - "/api/v1/ui-data/ocr-pdf" -> "ocr-pdf"
   * - "/api/v1/misc/repair" -> "repair"
   * - "/api/v1/general/merge-pdfs" -> "merge-pdfs"
   * - "/api/v1/convert/pdf/presentation" -> "pdf-to-presentation"
   */
  private extractEndpointName(endpoint: string): string {
    // UI data endpoints: /api/v1/ui-data/{endpoint-name}
    const uiDataMatch = endpoint.match(/^\/api\/v1\/ui-data\/(.+)$/);
    if (uiDataMatch) {
      return uiDataMatch[1];
    }

    // Convert endpoints: Use reverse lookup from actual constants
    if (endpoint.startsWith("/api/v1/convert/")) {
      // Find the key in CONVERSION_ENDPOINTS that matches this path
      for (const [key, path] of Object.entries(CONVERSION_ENDPOINTS)) {
        if (path === endpoint) {
          // Use that key to get the endpoint name from ENDPOINT_NAMES
          return ENDPOINT_NAMES[key as keyof typeof ENDPOINT_NAMES];
        }
      }
      // Fallback to pattern-based extraction if not found in constants
      const convertMatch = endpoint.match(
        /^\/api\/v1\/convert\/([^/]+)\/([^/]+)$/,
      );
      if (convertMatch) {
        const [, from, to] = convertMatch;
        return `${from}-to-${to}`;
      }
    }

    // Tool operation endpoints: /api/v1/{category}/{endpoint-name}
    const toolMatch = endpoint.match(
      /^\/api\/v1\/(?:general|misc|security|filter|multi-tool)\/(.+)$/,
    );
    if (toolMatch) {
      return toolMatch[1];
    }

    // Not a recognized pattern, return as-is
    return endpoint;
  }

  /**
   * Gets the base URL for an operation based on execution target
   * Enhanced with capability-based routing for tools not supported locally
   * @param operation - The operation endpoint path (for endpoint classification)
   * @returns Base URL for API calls
   */
  async getBaseUrl(operation?: string): Promise<string> {
    const mode = await connectionModeService.getCurrentMode();

    // Local-only mode: route everything to local backend; open settings if tool unavailable
    if (mode === "local") {
      if (operation && this.isToolEndpoint(operation)) {
        const endpointName = this.extractEndpointName(operation);
        const backendUrl = tauriBackendService.getBackendUrl();
        if (backendUrl) {
          const supportedLocally =
            await endpointAvailabilityService.isEndpointSupportedLocally(
              endpointName,
              backendUrl,
            );
          if (!supportedLocally) {
            // Open the connection settings so the user can sign in
            window.dispatchEvent(
              new CustomEvent("appConfig:navigate", {
                detail: { key: "connectionMode" },
              }),
            );
            throw new Error(
              i18n.t(
                "localMode.toolUnavailable",
                "This tool requires an account. Sign in to Stirling Cloud or connect to a self-hosted server to use it.",
              ),
            );
          }
        }
      }
      const backendUrl = tauriBackendService.getBackendUrl();
      if (!backendUrl) {
        throw new Error(
          "Backend URL not available - backend may still be starting",
        );
      }
      return backendUrl.replace(/\/$/, "");
    }

    // Always route team endpoints to SaaS backend (existing logic)
    if (mode === "saas" && this.isSaaSBackendEndpoint(operation)) {
      if (!STIRLING_SAAS_BACKEND_API_URL) {
        throw new Error("VITE_SAAS_BACKEND_API_URL not configured");
      }
      console.debug(
        `[operationRouter] Routing ${operation} to SaaS backend (team endpoint)`,
      );
      return STIRLING_SAAS_BACKEND_API_URL.replace(/\/$/, "");
    }

    // NEW: Check if local backend supports this tool endpoint
    if (mode === "saas" && operation && this.isToolEndpoint(operation)) {
      // Extract endpoint name for capability check (e.g., "/api/v1/misc/repair" -> "repair")
      const endpointToCheck = this.extractEndpointName(operation);
      console.debug(
        `[operationRouter] Checking capability for ${operation} -> endpoint name: ${endpointToCheck}`,
      );

      const backendUrl = tauriBackendService.getBackendUrl();
      const backendHealthy = tauriBackendService.isOnline;

      // If the local backend isn't ready (no URL yet, or not yet healthy), skip the
      // capability check and fall through to local routing — the backend-readiness check
      // in the Axios interceptor will block non-GET requests until the backend is healthy.
      if (backendUrl && backendHealthy) {
        const supportedLocally =
          await endpointAvailabilityService.isEndpointSupportedLocally(
            endpointToCheck,
            backendUrl,
          );
        console.debug(
          `[operationRouter] Endpoint ${endpointToCheck} supported locally: ${supportedLocally}`,
        );

        if (!supportedLocally) {
          // Local backend doesn't support this - check if SaaS supports it
          const supportedOnSaaS =
            await endpointAvailabilityService.isEndpointSupportedOnSaaS(
              endpointToCheck,
            );
          console.debug(
            `[operationRouter] Endpoint ${endpointToCheck} supported on SaaS: ${supportedOnSaaS}`,
          );

          if (!supportedOnSaaS) {
            // Neither local nor SaaS support this - throw error
            console.error(
              `[operationRouter] Endpoint ${endpointToCheck} not supported on local or SaaS backend`,
            );
            throw new Error(
              `This operation (${endpointToCheck}) is not available. It may require a self-hosted instance with additional features enabled.`,
            );
          }

          // SaaS supports it - route to SaaS backend
          if (!STIRLING_SAAS_BACKEND_API_URL) {
            console.error(
              "[operationRouter] VITE_SAAS_BACKEND_API_URL not configured",
            );
            throw new Error(
              "Cloud processing is required for this tool but VITE_SAAS_BACKEND_API_URL is not configured. " +
                "Please check your environment configuration.",
            );
          }
          console.debug(
            `[operationRouter] Routing ${operation} to SaaS backend (not supported locally, but supported on SaaS)`,
          );
          return STIRLING_SAAS_BACKEND_API_URL.replace(/\/$/, "");
        }

        // Supported locally - continue with local backend
        console.debug(
          `[operationRouter] Routing ${operation} to local backend (supported locally)`,
        );
      }
    }

    // Self-hosted fallback: when the remote server is offline, route tool endpoints
    // to the local bundled backend if it supports them.
    if (mode === "selfhosted" && operation && this.isToolEndpoint(operation)) {
      const { status } = selfHostedServerMonitor.getSnapshot();
      if (status === "offline") {
        const endpointName = this.extractEndpointName(operation);
        const localUrl = tauriBackendService.getBackendUrl();
        if (localUrl) {
          const supportedLocally =
            await endpointAvailabilityService.isEndpointSupportedLocally(
              endpointName,
              localUrl,
            );
          if (supportedLocally) {
            console.debug(
              `[operationRouter] Self-hosted server offline, routing ${operation} to local backend`,
            );
            return localUrl.replace(/\/$/, "");
          }
        }
        throw new Error(
          i18n.t(
            "selfHosted.offline.toolNotAvailableLocally",
            'Your Stirling-PDF server is offline and "{{endpoint}}" is not available on the local backend.',
            { endpoint: endpointName },
          ),
        );
      }
    }

    // Existing logic for local/remote routing
    const target = await this.getExecutionTarget(operation);

    if (target === "local") {
      // Use dynamically assigned port from backend service
      const backendUrl = tauriBackendService.getBackendUrl();
      if (!backendUrl) {
        throw new Error(
          "Backend URL not available - backend may still be starting",
        );
      }
      // Strip trailing slash to avoid double slashes in URLs
      return backendUrl.replace(/\/$/, "");
    }

    // Remote: get from server config
    const serverConfig = await connectionModeService.getServerConfig();
    if (!serverConfig) {
      console.warn("No server config found");
      throw new Error("Server configuration not found");
    }

    // Strip trailing slash to avoid double slashes in URLs
    return serverConfig.url.replace(/\/$/, "");
  }

  /**
   * Checks if we're currently in self-hosted mode
   */
  async isSelfHostedMode(): Promise<boolean> {
    const mode = await connectionModeService.getCurrentMode();
    return mode === "selfhosted";
  }

  /**
   * Checks if we're currently in SaaS mode
   */
  async isSaaSMode(): Promise<boolean> {
    const mode = await connectionModeService.getCurrentMode();
    return mode === "saas";
  }

  /**
   * Checks if an endpoint should skip the local backend readiness check
   * Returns true if the endpoint routes to SaaS backend (not local backend)
   * Enhanced to support capability-based routing
   * @param endpoint - The endpoint path to check
   * @returns Promise<boolean> - true if endpoint should skip backend readiness check
   */
  async shouldSkipBackendReadyCheck(endpoint?: string): Promise<boolean> {
    // Team endpoints always skip (existing logic)
    if (this.isSaaSBackendEndpoint(endpoint)) {
      return true;
    }

    // NEW: Skip if endpoint will be routed to SaaS due to local unavailability
    const mode = await connectionModeService.getCurrentMode();
    if (mode === "saas" && endpoint && this.isToolEndpoint(endpoint)) {
      const backendUrl = tauriBackendService.getBackendUrl();
      // Backend not ready — don't skip the readiness check; let it gate the request.
      if (!backendUrl || !tauriBackendService.isOnline) return false;
      const endpointToCheck = this.extractEndpointName(endpoint);
      const supportedLocally =
        await endpointAvailabilityService.isEndpointSupportedLocally(
          endpointToCheck,
          backendUrl,
        );
      return !supportedLocally; // Skip check if not supported locally
    }

    return false;
  }

  /**
   * Check if an endpoint will be routed to SaaS backend
   * Used by UI to show "Cloud" badges on tools
   * @param endpoint - The endpoint path to check
   * @returns Promise<boolean> - true if endpoint will route to SaaS
   */
  async willRouteToSaaS(endpoint: string): Promise<boolean> {
    const mode = await connectionModeService.getCurrentMode();
    // In local mode, show cloud badge for tools not supported locally
    // (clicking them will prompt sign-in via onUnavailableClick)
    if (mode !== "saas" && mode !== "local") return false;

    // Team endpoints always go to SaaS
    if (this.isSaaSBackendEndpoint(endpoint)) return true;

    // Tool endpoints go to SaaS if not supported locally
    if (this.isToolEndpoint(endpoint)) {
      // For UI data endpoints, extract the endpoint name
      const endpointToCheck = this.extractEndpointName(endpoint);
      const supportedLocally =
        await endpointAvailabilityService.isEndpointSupportedLocally(
          endpointToCheck,
          tauriBackendService.getBackendUrl(),
        );
      return !supportedLocally;
    }

    return false;
  }

  // Future enhancement: operation classification
  // private isSimpleOperation(operation: string): boolean {
  //   const simpleOperations = [
  //     'rotate',
  //     'merge',
  //     'split',
  //     'extract-pages',
  //     'remove-pages',
  //     'reorder-pages',
  //     'metadata',
  //   ];
  //   return simpleOperations.includes(operation);
  // }
}

export const operationRouter = OperationRouter.getInstance();
