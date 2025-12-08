import i18n from '@app/i18n';
import { tauriBackendService } from '@app/services/tauriBackendService';
import type { BackendHealthState } from '@app/types/backendHealth';

type Listener = (state: BackendHealthState) => void;

class BackendHealthMonitor {
  private listeners = new Set<Listener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private state: BackendHealthState = {
    status: tauriBackendService.getBackendStatus(),
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
        message: status === 'healthy'
          ? i18n.t('backendHealth.online', 'Backend Online')
          : this.state.message ?? i18n.t('backendHealth.offline', 'Backend Offline'),
      });
    });
  }

  private updateState(partial: Partial<BackendHealthState>) {
    const nextStatus = partial.status ?? this.state.status;
    const nextState = {
      ...this.state,
      ...partial,
      status: nextStatus,
      isHealthy: nextStatus === 'healthy',
    };

    // Only notify listeners if meaningful state changed
    const meaningfulChange =
      this.state.status !== nextState.status ||
      this.state.error !== nextState.error ||
      this.state.message !== nextState.message;

    this.state = nextState;

    if (meaningfulChange) {
      this.listeners.forEach((listener) => listener(this.state));
    }
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
    try {
      const healthy = await tauriBackendService.checkBackendHealth();
      if (healthy) {
        this.updateState({
          status: 'healthy',
          message: i18n.t('backendHealth.online', 'Backend Online'),
          error: null,
        });
      } else {
        this.updateState({
          status: 'unhealthy',
          message: i18n.t('backendHealth.offline', 'Backend Offline'),
          error: i18n.t('backendHealth.offline', 'Backend Offline'),
        });
      }
      return healthy;
    } catch (error) {
      console.error('[BackendHealthMonitor] Health check failed:', error);
      this.updateState({
        status: 'unhealthy',
        message: 'Backend is unavailable',
        error: 'Backend offline',
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
