import { invoke } from '@tauri-apps/api/core';

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

  async ensureBackendUrl(): Promise<string> {
    if (this.backendPort) {
      return `http://localhost:${this.backendPort}`;
    }
    await this.waitForPort();
    if (!this.backendPort) {
      throw new Error('Backend port not available');
    }
    return `http://localhost:${this.backendPort}`;
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

  async startBackend(): Promise<void> {
    if (this.backendStarted) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.setStatus('starting');

    this.backendPort = null;

    this.startPromise = invoke('start_backend')
      .then(async (result) => {
        console.log('Backend started:', result);
        this.backendStarted = true;
        this.setStatus('starting');

        // Wait for backend to log the chosen port before we allow API calls
        await this.waitForPort();

        this.beginHealthMonitoring();
      })
      .catch((error) => {
        this.setStatus('unhealthy');
        console.error('Failed to start backend:', error);
        this.backendPort = null;
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

  private async waitForPort(maxAttempts = 30): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const port = await invoke<number | null>('get_backend_port');
        if (port) {
          this.backendPort = port;
          console.log(`[TauriBackendService] Backend port detected: ${port}`);
          return;
        }
      } catch (error) {
        console.error('[TauriBackendService] Failed to get backend port:', error);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Failed to detect backend port after 15 seconds');
  }

  async checkBackendHealth(): Promise<boolean> {
    if (!this.backendStarted) {
      this.setStatus('stopped');
      return false;
    }

    if (!this.backendPort) {
      return false;
    }

    try {
      const isHealthy = await invoke<boolean>('check_backend_health', { port: this.backendPort });
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
}

export const tauriBackendService = TauriBackendService.getInstance();
