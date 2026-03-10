import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

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

  get isOnline(): boolean {
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
   * Does not start bundled backend, but enables health checks.
   * Also discovers the local bundled backend port so it can be used as a fallback
   * when the self-hosted server is offline.
   */
  async initializeExternalBackend(): Promise<void> {
    if (this.backendStarted) {
      return;
    }

    this.backendStarted = true; // Mark as active for health checks
    this.setStatus('starting');
    this.beginHealthMonitoring();

    // Discover the local bundled backend port in the background.
    // The Rust side always starts the local backend, so we can poll for its port
    // even in self-hosted mode. This allows local fallback when the server is offline.
    void this.waitForPort();
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

  private async waitForPort(): Promise<void> {
    while (true) {
      try {
        const port = await invoke<number | null>('get_backend_port');
        if (port) {
          this.backendPort = port;
          // Notify status listeners so hooks reading getBackendUrl() re-evaluate
          this.statusListeners.forEach(listener => listener(this.backendStatus));
          return;
        }
      } catch (error) {
        console.error('Failed to get backend port:', error);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
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

  /** Always checks the local bundled backend at localhost:{port}. */
  async checkBackendHealth(): Promise<boolean> {
    if (!this.backendStarted) {
      console.debug('[TauriBackendService] Health check: backend not started');
      this.setStatus('stopped');
      return false;
    }
    if (!this.backendPort) {
      console.debug('[TauriBackendService] Health check: backend port not available');
      return false;
    }

    const configUrl = `http://localhost:${this.backendPort}/api/v1/config/app-config`;
    console.debug(`[TauriBackendService] Checking local backend health at: ${configUrl}`);

    try {
      const response = await fetch(configUrl, { method: 'GET', connectTimeout: 5000 });

      if (!response.ok) {
        console.warn(`[TauriBackendService] Health check failed: ${response.status}`);
        this.setStatus('unhealthy');
        return false;
      }

      const data = await response.json();
      const dependenciesReady = data.dependenciesReady === true;
      console.debug(`[TauriBackendService] dependenciesReady=${dependenciesReady}`);

      this.setStatus(dependenciesReady ? 'healthy' : 'starting');
      return dependenciesReady;
    } catch (error) {
      console.error('[TauriBackendService] Health check error:', error);
      this.setStatus('unhealthy');
      return false;
    }
  }

  private async waitForHealthy(): Promise<void> {
    while (true) {
      const isHealthy = await this.checkBackendHealth();
      if (isHealthy) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
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
