import { invoke } from '@tauri-apps/api/core';

export class BackendService {
  private static instance: BackendService;
  private backendStarted = false;

  static getInstance(): BackendService {
    if (!BackendService.instance) {
      BackendService.instance = new BackendService();
    }
    return BackendService.instance;
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
    try {
      return await invoke('check_backend_health');
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  private async waitForHealthy(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const isHealthy = await this.checkHealth();
      if (isHealthy) {
        console.log('Backend is healthy');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Backend failed to become healthy after 30 seconds');
  }

  getBackendUrl(): string {
    return 'http://localhost:8080';
  }

  async makeApiCall(endpoint: string, options?: RequestInit): Promise<Response> {
    if (!this.backendStarted) {
      await this.startBackend();
    }

    const url = `${this.getBackendUrl()}${endpoint}`;
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }
}

export const backendService = BackendService.getInstance();