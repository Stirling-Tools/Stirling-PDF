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
   * @param _operation - The operation name (for future operation classification)
   * @returns 'local' or 'remote'
   */
  async getExecutionTarget(_operation?: string): Promise<ExecutionTarget> {
    const mode = await connectionModeService.getCurrentMode();

    // Current implementation: simple mode-based routing
    if (mode === 'offline') {
      return 'local';
    }

    // In server mode, currently all operations go to remote
    // Future enhancement: check if operation is "simple" and route to local if so
    // Example future logic:
    // if (mode === 'server' && operation && this.isSimpleOperation(operation)) {
    //   return 'local';
    // }

    return 'remote';
  }

  /**
   * Gets the base URL for an operation based on execution target
   * @param _operation - The operation name (for future operation classification)
   * @returns Base URL for API calls
   */
  async getBaseUrl(_operation?: string): Promise<string> {
    const target = await this.getExecutionTarget(_operation);

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
   * Checks if we're currently in remote mode
   */
  async isRemoteMode(): Promise<boolean> {
    const mode = await connectionModeService.getCurrentMode();
    return mode === 'server';
  }

  /**
   * Checks if we're currently in offline mode
   */
  async isOfflineMode(): Promise<boolean> {
    const mode = await connectionModeService.getCurrentMode();
    return mode === 'offline';
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
