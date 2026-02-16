import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { STIRLING_SAAS_BACKEND_API_URL } from '@app/constants/connection';

export type ExecutionTarget = 'local' | 'remote';

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
    if (mode === 'saas') {
      // SaaS mode: For now, all operations run locally
      // Future enhancement: complex operations will be sent to SaaS server
      return 'local';
    }

    // In self-hosted mode, currently all operations go to remote
    // Future enhancement: check if operation is "simple" and route to local if so
    // Example future logic:
    // if (mode === 'selfhosted' && operation && this.isSimpleOperation(operation)) {
    //   return 'local';
    // }

    return 'remote';
  }

  /**
   * Check if endpoint should route to SaaS backend (not local)
   * @param endpoint - The endpoint path to check
   * @returns true if endpoint should route to SaaS backend
   */
  private isSaaSBackendEndpoint(endpoint?: string): boolean {
    if (!endpoint) return false;

    const saasBackendPatterns = [
      /^\/api\/v1\/team\//,  // Team endpoints
      // Add more SaaS-specific patterns here as needed
    ];

    return saasBackendPatterns.some(pattern => pattern.test(endpoint));
  }

  /**
   * Gets the base URL for an operation based on execution target
   * @param operation - The operation endpoint path (for endpoint classification)
   * @returns Base URL for API calls
   */
  async getBaseUrl(operation?: string): Promise<string> {
    const mode = await connectionModeService.getCurrentMode();

    // In SaaS mode, check if this endpoint should go to SaaS backend
    if (mode === 'saas' && this.isSaaSBackendEndpoint(operation)) {
      if (!STIRLING_SAAS_BACKEND_API_URL) {
        throw new Error('VITE_SAAS_BACKEND_API_URL not configured');
      }
      console.debug(`[operationRouter] Routing ${operation} to SaaS backend: ${STIRLING_SAAS_BACKEND_API_URL}`);
      return STIRLING_SAAS_BACKEND_API_URL.replace(/\/$/, '');
    }

    // Existing logic for local/remote routing
    const target = await this.getExecutionTarget(operation);

    if (target === 'local') {
      // Use dynamically assigned port from backend service
      const backendUrl = tauriBackendService.getBackendUrl();
      if (!backendUrl) {
        throw new Error('Backend URL not available - backend may still be starting');
      }
      // Strip trailing slash to avoid double slashes in URLs
      return backendUrl.replace(/\/$/, '');
    }

    // Remote: get from server config
    const serverConfig = await connectionModeService.getServerConfig();
    if (!serverConfig) {
      console.warn('No server config found');
      throw new Error('Server configuration not found');
    }

    // Strip trailing slash to avoid double slashes in URLs
    return serverConfig.url.replace(/\/$/, '');
  }

  /**
   * Checks if we're currently in self-hosted mode
   */
  async isSelfHostedMode(): Promise<boolean> {
    const mode = await connectionModeService.getCurrentMode();
    return mode === 'selfhosted';
  }

  /**
   * Checks if we're currently in SaaS mode
   */
  async isSaaSMode(): Promise<boolean> {
    const mode = await connectionModeService.getCurrentMode();
    return mode === 'saas';
  }

  /**
   * Checks if an endpoint should skip the local backend readiness check
   * Returns true if the endpoint routes to SaaS backend (not local backend)
   * @param endpoint - The endpoint path to check
   * @returns true if endpoint should skip backend readiness check
   */
  shouldSkipBackendReadyCheck(endpoint?: string): boolean {
    // SaaS backend endpoints don't depend on local backend being ready
    return this.isSaaSBackendEndpoint(endpoint);
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
