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
      .then(async () => {
        this.backendStarted = true;
        this.setStatus('starting');

        // Poll for the dynamically assigned port
        await this.waitForPort();
        this.beginHealthMonitoring();
      })
      .catch((error) => {
        this.setStatus('unhealthy');
        console.error('[TauriBackendService] Failed to start backend:', error);
        throw error;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  private async waitForPort(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const port = await invoke<number | null>('get_backend_port');
        if (port) {
          this.backendPort = port;
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
    const mode = await connectionModeService.getCurrentMode();

    // Determine base URL based on mode
    let baseUrl: string;
    if (mode === 'selfhosted') {
      const serverConfig = await connectionModeService.getServerConfig();
      if (!serverConfig) {
        console.error('[TauriBackendService] Self-hosted mode but no server URL configured');
        this.setStatus('unhealthy');
        return false;
      }
      baseUrl = serverConfig.url.replace(/\/$/, '');
    } else {
      // SaaS mode - check bundled local backend
      if (!this.backendStarted) {
        this.setStatus('stopped');
        return false;
      }
      if (!this.backendPort) {
        return false;
      }
      baseUrl = `http://localhost:${this.backendPort}`;
    }

    // Check if backend is ready (dependencies checked)
    try {
      const configUrl = `${baseUrl}/api/v1/config/app-config`;

      // For self-hosted mode, include auth token if available
      const headers: Record<string, string> = {};
      if (mode === 'selfhosted') {
        // Check localStorage first (web layer token)
        let token = localStorage.getItem('stirling_jwt');
        if (!token) {
          // Fallback to Tauri store
          try {
            token = await invoke<string | null>('get_auth_token');
          } catch {
            console.debug('[TauriBackendService] No auth token available for health check');
          }
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      const response = await fetch(configUrl, {
        method: 'GET',
        connectTimeout: 5000,
        headers,
      });

      if (!response.ok) {
        this.setStatus('unhealthy');
        return false;
      }

      const data = await response.json();
      const dependenciesReady = data.dependenciesReady === true;
      this.setStatus(dependenciesReady ? 'healthy' : 'starting');
      return dependenciesReady;
    } catch {
      this.setStatus('unhealthy');
      return false;
    }
  }

  private async waitForHealthy(maxAttempts = 60): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const isHealthy = await this.checkBackendHealth();
      if (isHealthy) {
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
    this.backendStarted = false;
    this.backendPort = null;
    this.setStatus('stopped');
    this.healthMonitor = null;
    this.startPromise = null;
  }
}

export const tauriBackendService = TauriBackendService.getInstance();
