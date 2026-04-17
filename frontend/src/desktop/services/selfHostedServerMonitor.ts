import { fetch } from "@tauri-apps/plugin-http";

export interface SelfHostedServerState {
  status: "idle" | "checking" | "online" | "offline";
  isOnline: boolean;
  serverUrl: string | null;
}

type Listener = (state: SelfHostedServerState) => void;

const POLL_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Singleton service that independently monitors the health of the self-hosted
 * Stirling-PDF server. Used in self-hosted connection mode to detect when the
 * remote server goes offline so that the operation router can fall back to the
 * local bundled backend for supported tools.
 *
 * This is separate from tauriBackendService / backendHealthMonitor so that the
 * local-backend health indicator (BackendHealthIndicator) and the self-hosted
 * server status can be tracked independently.
 */
class SelfHostedServerMonitor {
  private static instance: SelfHostedServerMonitor;

  private state: SelfHostedServerState = {
    status: "idle",
    isOnline: false,
    serverUrl: null,
  };

  private listeners = new Set<Listener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  static getInstance(): SelfHostedServerMonitor {
    if (!SelfHostedServerMonitor.instance) {
      SelfHostedServerMonitor.instance = new SelfHostedServerMonitor();
    }
    return SelfHostedServerMonitor.instance;
  }

  /**
   * Start polling the given server URL for health.
   * Safe to call multiple times; only starts one polling loop at a time.
   * Call stop() before calling start() again with a different URL.
   */
  start(serverUrl: string): void {
    if (this.intervalId !== null && this.state.serverUrl === serverUrl) {
      // Already polling this URL
      return;
    }

    this.stop();

    this.updateState({ serverUrl, status: "checking", isOnline: false });

    void this.pollOnce(serverUrl);
    this.intervalId = setInterval(() => {
      void this.pollOnce(serverUrl);
    }, POLL_INTERVAL_MS);
  }

  /** Stop polling. */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.updateState({ status: "idle", isOnline: false, serverUrl: null });
  }

  get isOnline(): boolean {
    return this.state.isOnline;
  }

  getSnapshot(): SelfHostedServerState {
    return this.state;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Emit current state immediately so subscribers are always initialised
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Trigger an immediate health check outside of the scheduled interval. */
  async checkNow(): Promise<void> {
    if (this.state.serverUrl) {
      await this.pollOnce(this.state.serverUrl);
    }
  }

  private async pollOnce(serverUrl: string): Promise<void> {
    const healthUrl = `${serverUrl.replace(/\/$/, "")}/api/v1/info/status`;

    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        connectTimeout: REQUEST_TIMEOUT_MS,
      });

      // 401/403 means the server is running but requires authentication — treat as online
      if (response.ok || response.status === 401 || response.status === 403) {
        this.updateState({ status: "online", isOnline: true });
      } else {
        this.updateState({ status: "offline", isOnline: false });
      }
    } catch {
      this.updateState({ status: "offline", isOnline: false });
    }
  }

  private updateState(partial: Partial<SelfHostedServerState>): void {
    const next = { ...this.state, ...partial };

    const changed =
      next.status !== this.state.status ||
      next.isOnline !== this.state.isOnline ||
      next.serverUrl !== this.state.serverUrl;

    this.state = next;

    if (changed) {
      this.listeners.forEach((listener) => listener(this.state));
    }
  }
}

export const selfHostedServerMonitor = SelfHostedServerMonitor.getInstance();
