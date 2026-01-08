import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

export type ConnectionMode = 'saas' | 'selfhosted';

export interface ServerConfig {
  url: string;
  enabledOAuthProviders?: string[];
}

export interface ConnectionConfig {
  mode: ConnectionMode;
  server_config: ServerConfig | null;
}

export class ConnectionModeService {
  private static instance: ConnectionModeService;
  private currentConfig: ConnectionConfig | null = null;
  private configLoadedOnce = false;
  private modeListeners = new Set<(config: ConnectionConfig) => void>();

  static getInstance(): ConnectionModeService {
    if (!ConnectionModeService.instance) {
      ConnectionModeService.instance = new ConnectionModeService();
    }
    return ConnectionModeService.instance;
  }

  async getCurrentConfig(): Promise<ConnectionConfig> {
    if (!this.configLoadedOnce) {
      await this.loadConfig();
    }
    return this.currentConfig || { mode: 'saas', server_config: null };
  }

  async getCurrentMode(): Promise<ConnectionMode> {
    const config = await this.getCurrentConfig();
    return config.mode;
  }

  async getServerConfig(): Promise<ServerConfig | null> {
    const config = await this.getCurrentConfig();
    return config.server_config;
  }

  subscribeToModeChanges(listener: (config: ConnectionConfig) => void): () => void {
    this.modeListeners.add(listener);
    return () => {
      this.modeListeners.delete(listener);
    };
  }

  private notifyListeners() {
    if (this.currentConfig) {
      this.modeListeners.forEach(listener => listener(this.currentConfig!));
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await invoke<ConnectionConfig>('get_connection_config');
      this.currentConfig = config;
      this.configLoadedOnce = true;
    } catch (error) {
      console.error('Failed to load connection config:', error);
      // Default to SaaS mode on error
      this.currentConfig = { mode: 'saas', server_config: null };
      this.configLoadedOnce = true;
    }
  }

  async switchToSaaS(saasServerUrl: string): Promise<void> {
    console.log('Switching to SaaS mode');

    const serverConfig: ServerConfig = { url: saasServerUrl };

    await invoke('set_connection_mode', {
      mode: 'saas',
      serverConfig,
    });

    this.currentConfig = { mode: 'saas', server_config: serverConfig };
    this.notifyListeners();

    console.log('Switched to SaaS mode successfully');
  }

  async switchToSelfHosted(serverConfig: ServerConfig): Promise<void> {
    console.log('Switching to self-hosted mode:', serverConfig);

    await invoke('set_connection_mode', {
      mode: 'selfhosted',
      serverConfig,
    });

    this.currentConfig = { mode: 'selfhosted', server_config: serverConfig };
    this.notifyListeners();

    console.log('Switched to self-hosted mode successfully');
  }

  /**
   * Test connection to a server URL and return detailed error information
   * @returns Object with success status and optional error message
   */
  async testConnection(url: string): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    console.log(`[ConnectionModeService] Testing connection to: ${url}`);

    try {
      // Test connection by hitting the health/status endpoint
      const healthUrl = `${url.replace(/\/$/, '')}/api/v1/info/status`;
      console.log(`[ConnectionModeService] Health check URL: ${healthUrl}`);

      const response = await fetch(healthUrl, {
        method: 'GET',
        connectTimeout: 10000,
      });

      if (response.ok) {
        console.log(`[ConnectionModeService] ✅ Server connection test successful`);
        return { success: true };
      } else {
        const errorMsg = `Server returned status ${response.status}`;
        console.error(`[ConnectionModeService] ❌ ${errorMsg}`);
        return {
          success: false,
          error: errorMsg,
          errorCode: `HTTP_${response.status}`,
        };
      }
    } catch (error) {
      console.error('[ConnectionModeService] ❌ Server connection test failed:', error);

      // Extract detailed error information
      if (error instanceof Error) {
        const errMsg = error.message.toLowerCase();

        // Connection refused
        if (errMsg.includes('connection refused') || errMsg.includes('econnrefused')) {
          return {
            success: false,
            error: 'Connection refused. Server may not be running or the port is incorrect.',
            errorCode: 'CONNECTION_REFUSED',
          };
        }
        // Timeout
        else if (errMsg.includes('timeout') || errMsg.includes('timed out')) {
          return {
            success: false,
            error: 'Connection timed out. Server is not responding within 10 seconds.',
            errorCode: 'TIMEOUT',
          };
        }
        // DNS failure
        else if (errMsg.includes('getaddrinfo') || errMsg.includes('dns') || errMsg.includes('not found') || errMsg.includes('enotfound')) {
          return {
            success: false,
            error: 'Cannot resolve server address. Please check the URL is correct.',
            errorCode: 'DNS_FAILURE',
          };
        }
        // SSL/TLS errors
        else if (errMsg.includes('ssl') || errMsg.includes('tls') || errMsg.includes('certificate') || errMsg.includes('cert')) {
          return {
            success: false,
            error: 'SSL/TLS certificate error. Server may have an invalid or self-signed certificate.',
            errorCode: 'SSL_ERROR',
          };
        }
        // Protocol errors
        else if (errMsg.includes('protocol')) {
          return {
            success: false,
            error: 'Protocol error. Try using https:// instead of http:// or vice versa.',
            errorCode: 'PROTOCOL_ERROR',
          };
        }
        // Generic error
        return {
          success: false,
          error: error.message,
          errorCode: 'NETWORK_ERROR',
        };
      }

      return {
        success: false,
        error: 'Unknown error occurred while testing connection',
        errorCode: 'UNKNOWN',
      };
    }
  }

  async isFirstLaunch(): Promise<boolean> {
    try {
      const result = await invoke<boolean>('is_first_launch');
      return result;
    } catch (error) {
      console.error('Failed to check first launch:', error);
      return false;
    }
  }

  async resetSetupCompletion(): Promise<void> {
    try {
      await invoke('reset_setup_completion');
      console.log('Setup completion flag reset successfully');
    } catch (error) {
      console.error('Failed to reset setup completion:', error);
      throw error;
    }
  }
}

export const connectionModeService = ConnectionModeService.getInstance();
