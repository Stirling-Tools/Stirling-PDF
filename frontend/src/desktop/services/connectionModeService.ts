import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

export type ConnectionMode = 'offline' | 'server';
export type ServerType = 'saas' | 'selfhosted';

export interface ServerConfig {
  url: string;
  server_type: ServerType;
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
    return this.currentConfig || { mode: 'offline', server_config: null };
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
      // Default to offline mode on error
      this.currentConfig = { mode: 'offline', server_config: null };
      this.configLoadedOnce = true;
    }
  }

  async switchToOffline(): Promise<void> {
    console.log('Switching to offline mode');

    await invoke('set_connection_mode', {
      mode: 'offline',
      serverConfig: null,
    });

    this.currentConfig = { mode: 'offline', server_config: null };
    this.notifyListeners();

    console.log('Switched to offline mode successfully');
  }

  async switchToServer(serverConfig: ServerConfig): Promise<void> {
    console.log('Switching to server mode:', serverConfig);

    await invoke('set_connection_mode', {
      mode: 'server',
      serverConfig,
    });

    this.currentConfig = { mode: 'server', server_config: serverConfig };
    this.notifyListeners();

    console.log('Switched to server mode successfully');
  }

  async testConnection(url: string): Promise<boolean> {
    console.log(`[ConnectionModeService] Testing connection to: ${url}`);
    try {
      // Test connection by hitting the health/status endpoint
      const healthUrl = `${url.replace(/\/$/, '')}/api/v1/info/status`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        connectTimeout: 10000,
      });

      const isOk = response.ok;
      console.log(`[ConnectionModeService] Server connection test result: ${isOk}`);
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
}

export const connectionModeService = ConnectionModeService.getInstance();
