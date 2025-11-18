import { invoke } from '@tauri-apps/api/core';

export type BackendStatus = 'stopped' | 'starting' | 'healthy' | 'unhealthy';

export class TauriBackendService {
  private static instance: TauriBackendService;
  private backendStarted = false;
  private backendStatus: BackendStatus = 'stopped';
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
      .then((result) => {
        console.log('Backend started:', result);
        this.backendStarted = true;
        this.setStatus('starting');
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
      const isHealthy = await invoke<boolean>('check_backend_health');
      this.setStatus(isHealthy ? 'healthy' : 'unhealthy');
      return isHealthy;
    } catch (error) {
      console.error('Health check failed:', error);
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
    this.setStatus('stopped');
    this.healthMonitor = null;
    this.startPromise = null;
  }
}

export const tauriBackendService = TauriBackendService.getInstance();
