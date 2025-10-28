import { invoke } from '@tauri-apps/api/core';

export class TauriBackendService {
  private static instance: TauriBackendService;
  private backendStarted = false;

  static getInstance(): TauriBackendService {
    if (!TauriBackendService.instance) {
      TauriBackendService.instance = new TauriBackendService();
    }
    return TauriBackendService.instance;
  }

  async startBackend(): Promise<void> {
    if (this.backendStarted) {
      return;
    }

    try {
      const result = await invoke('start_backend');
      console.log('Backend started:', result);
      this.backendStarted = true;
      
      // Wait for backend to be healthy
      await this.waitForHealthy();
    } catch (error) {
      console.error('Failed to start backend:', error);
      throw error;
    }
  }

  async checkHealth(): Promise<boolean> {
    if (!this.backendStarted) {
      return false;
    }
    try {
      return await invoke('check_backend_health');
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  private async waitForHealthy(maxAttempts = 60): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const isHealthy = await this.checkHealth();
      if (isHealthy) {
        console.log('Backend is healthy');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Backend failed to become healthy after 60 seconds');
  }
}

export const tauriBackendService = TauriBackendService.getInstance();