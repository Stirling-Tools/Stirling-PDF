import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

export type ConnectionMode = 'saas' | 'selfhosted';

export interface ServerConfig {
  url: string;
  enabledOAuthProviders?: Array<{
    id: string;
    label?: string;
    url?: string;
  }>;
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

  async testConnection(url: string): Promise<boolean> {
    console.log(`[ConnectionModeService] Testing connection to: ${url}`);
    try {
      // Test connection by hitting the health/status endpoint
      const healthUrl = `${url.replace(/\/$/, '')}/api/v1/info/status`;

      // Prefer the browser fetch to avoid Tauri HTTP permission blockers
      if (typeof window !== 'undefined' && window.fetch) {
        const response = await window.fetch(healthUrl, { method: 'GET' });
        const isOk = response.ok;
        console.log(`[ConnectionModeService] Server connection test result (browser fetch): ${isOk}`);
        return isOk;
      }

      // Fallback to Tauri HTTP plugin
      const response = await fetch(healthUrl, {
        method: 'GET',
        connectTimeout: 10000,
      });
      const isOk = response.ok;
      console.log(`[ConnectionModeService] Server connection test result (tauri fetch): ${isOk}`);
      return isOk;
    } catch (error) {
      console.warn('[ConnectionModeService] Server connection test failed:', error);
      return false;
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
