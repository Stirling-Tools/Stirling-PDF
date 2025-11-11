import { tauriBackendService } from '@app/services/tauriBackendService';
import type { BackendHealthState } from '@app/types/backendHealth';

type Listener = (state: BackendHealthState) => void;

class BackendHealthMonitor {
  private listeners = new Set<Listener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private state: BackendHealthState = {
    status: tauriBackendService.getBackendStatus(),
    isChecking: false,
    error: null,
    isHealthy: tauriBackendService.getBackendStatus() === 'healthy',
  };

  constructor(pollingInterval = 5000) {
    this.intervalMs = pollingInterval;

    // Reflect status updates from the backend service immediately
    tauriBackendService.subscribeToStatus((status) => {
      this.updateState({
        status,
        error: status === 'healthy' ? null : this.state.error,
        message: status === 'healthy' ? 'Backend is healthy' : this.state.message,
        isChecking: status === 'healthy' ? false : this.state.isChecking,
      });
    });
  }

  private updateState(partial: Partial<BackendHealthState>) {
    const nextStatus = partial.status ?? this.state.status;
    this.state = {
      ...this.state,
      ...partial,
      status: nextStatus,
      isHealthy: nextStatus === 'healthy',
    };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private ensurePolling() {
    if (this.intervalId !== null) {
      return;
    }
    void this.pollOnce();
    this.intervalId = setInterval(() => {
      void this.pollOnce();
    }, this.intervalMs);
  }

  private stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async pollOnce(): Promise<boolean> {
    this.updateState({
      isChecking: true,
      lastChecked: Date.now(),
      error: this.state.error ?? 'Backend offline',
    });

    try {
      const healthy = await tauriBackendService.checkBackendHealth();
      if (healthy) {
        this.updateState({
          status: 'healthy',
          isChecking: false,
          message: 'Backend is healthy',
          error: null,
          lastChecked: Date.now(),
        });
      } else {
        this.updateState({
          status: 'unhealthy',
          isChecking: false,
          message: 'Backend is unavailable',
          error: 'Backend offline',
          lastChecked: Date.now(),
        });
      }
      return healthy;
    } catch (error) {
      console.error('[BackendHealthMonitor] Health check failed:', error);
      this.updateState({
        status: 'unhealthy',
        isChecking: false,
        message: 'Backend is unavailable',
        error: 'Backend offline',
        lastChecked: Date.now(),
      });
      return false;
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    if (this.listeners.size === 1) {
      this.ensurePolling();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopPolling();
      }
    };
  }

  getSnapshot(): BackendHealthState {
    return this.state;
  }

  async checkNow(): Promise<boolean> {
    return this.pollOnce();
  }
}

export const backendHealthMonitor = new BackendHealthMonitor();
