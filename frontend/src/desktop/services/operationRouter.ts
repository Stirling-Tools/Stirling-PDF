import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';

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
   * @param url - The request URL (can be path or full URL)
   * @returns 'local' or 'remote'
   */
  async getExecutionTarget(url?: string): Promise<ExecutionTarget> {
    const mode = await connectionModeService.getCurrentMode();

    if (mode === 'saas') {
      if (url?.includes('/api/v1/auth/')) {
        return 'remote';
      }
      return 'local';
    }

    return 'remote';
  }

  /**
   * Gets the base URL for an operation based on execution target
   * @param url - The request URL path
   * @returns Base URL for API calls
   */
  async getBaseUrl(url?: string): Promise<string> {
    const target = await this.getExecutionTarget(url);

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
