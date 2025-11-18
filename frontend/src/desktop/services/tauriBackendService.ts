import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';
import { connectionModeService } from '@app/services/connectionModeService';

export type BackendStatus = 'stopped' | 'starting' | 'healthy' | 'unhealthy';

export class TauriBackendService {
  private static instance: TauriBackendService;
  private backendStarted = false;
  private backendStatus: BackendStatus = 'stopped';
  private backendPort: number | null = null;
  private healthMonitor: Promise<void> | null = null;
  private startPromise: Promise<void> | null = null;
  private statusListeners = new Set<(status: BackendStatus) => void>();

  static getInstance(): TauriBackendService {
    if (!TauriBackendService.instance) {
      TauriBackendService.instance = new TauriBackendService();
    }
    return TauriBackendService.instance;
  }

  isBackendRunning(): boolean {
    return this.backendStarted;
  }

  getBackendStatus(): BackendStatus {
    return this.backendStatus;
  }

  isBackendHealthy(): boolean {
    return this.backendStatus === 'healthy';
  }

  getBackendPort(): number | null {
    return this.backendPort;
  }

  getBackendUrl(): string | null {
    return this.backendPort ? `http://localhost:${this.backendPort}` : null;
  }

  subscribeToStatus(listener: (status: BackendStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(status: BackendStatus) {
    if (this.backendStatus === status) {
      return;
    }
    this.backendStatus = status;
    this.statusListeners.forEach(listener => listener(status));
  }

  /**
   * Initialize health monitoring for an external server (server mode)
   * Does not start bundled backend, but enables health checks
   */
  async initializeExternalBackend(): Promise<void> {
    if (this.backendStarted) {
      return;
    }

    console.log('[TauriBackendService] Initializing external backend monitoring');
    this.backendStarted = true; // Mark as active for health checks
    this.setStatus('starting');
    this.beginHealthMonitoring();
  }

  async startBackend(backendUrl?: string): Promise<void> {
    if (this.backendStarted) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.setStatus('starting');

    this.startPromise = invoke('start_backend', { backendUrl })
      .then(async (result) => {
        console.log('Backend started:', result);
        this.backendStarted = true;
        this.setStatus('starting');

        // Poll for the dynamically assigned port
        await this.waitForPort();

        this.beginHealthMonitoring();
      })
      .catch((error) => {
        this.setStatus('unhealthy');
        console.error('Failed to start backend:', error);
        throw error;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  private async waitForPort(maxAttempts = 30): Promise<void> {
    console.log('[TauriBackendService] Waiting for backend port assignment...');
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const port = await invoke<number | null>('get_backend_port');
        if (port) {
          this.backendPort = port;
          console.log(`[TauriBackendService] Backend port detected: ${port}`);
          return;
        }
      } catch (error) {
        console.error('Failed to get backend port:', error);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Failed to detect backend port after 15 seconds');
  }

  private beginHealthMonitoring() {
    if (this.healthMonitor) {
      return;
    }
    this.healthMonitor = this.waitForHealthy()
      .catch((error) => {
        console.error('Backend failed to become healthy:', error);
      })
      .finally(() => {
        this.healthMonitor = null;
      });
  }

  async checkBackendHealth(): Promise<boolean> {
    if (!this.backendStarted) {
      this.setStatus('stopped');
      return false;
    }

    try {
      // Determine health check URL based on connection mode
      const mode = await connectionModeService.getCurrentMode();
      let healthUrl: string;

      if (mode === 'offline') {
        // Use dynamically assigned port for bundled backend
        if (!this.backendPort) {
          console.debug('[TauriBackendService] Backend port not available yet');
          return false;
        }
        healthUrl = `http://localhost:${this.backendPort}/api/v1/info/status`;
      } else {
        // Use configured server URL
        const serverConfig = await connectionModeService.getServerConfig();
        if (!serverConfig) {
          console.error('[TauriBackendService] Server mode but no server URL configured');
          this.setStatus('unhealthy');
          return false;
        }
        const baseUrl = serverConfig.url.replace(/\/$/, '');
        healthUrl = `${baseUrl}/api/v1/info/status`;
      }

      // Make health check request using Tauri's native HTTP client (bypasses CORS)
      const response = await fetch(healthUrl, {
        method: 'GET',
        connectTimeout: 5000,
      });

      const isHealthy = response.ok;
      this.setStatus(isHealthy ? 'healthy' : 'unhealthy');
      return isHealthy;
    } catch (error) {
      // Don't log common startup errors
      const errorStr = String(error);
      if (!errorStr.includes('connection refused') && !errorStr.includes('No connection could be made')) {
        console.error('[TauriBackendService] Health check failed:', error);
      }
      this.setStatus('unhealthy');
      return false;
    }
  }

  private async waitForHealthy(maxAttempts = 60): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const isHealthy = await this.checkBackendHealth();
      if (isHealthy) {
        console.log('Backend is healthy');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    this.setStatus('unhealthy');
    throw new Error('Backend failed to become healthy after 60 seconds');
  }

  /**
   * Reset backend state (used when switching from external to local backend)
   */
  reset(): void {
    console.log('[TauriBackendService] Resetting backend state');
    this.backendStarted = false;
    this.backendPort = null;
    this.setStatus('stopped');
    this.healthMonitor = null;
    this.startPromise = null;
  }
}

export const tauriBackendService = TauriBackendService.getInstance();
