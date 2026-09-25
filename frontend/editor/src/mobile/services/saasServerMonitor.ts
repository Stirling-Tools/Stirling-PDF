import { fetch } from "@tauri-apps/plugin-http";
import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";

export type SaasServerStatus = "idle" | "checking" | "online" | "offline";

export interface SaasServerState {
  status: SaasServerStatus;
  isOnline: boolean;
}

type Listener = (state: SaasServerState) => void;

/**
 * Reachability of the Stirling Cloud backend.
 *
 * A phone has no bundled backend, so in cloud mode the server that answers every
 * request is the SaaS API. This is the cloud counterpart of
 * `selfHostedServerMonitor`: same status endpoint, same "authenticated server is
 * still a reachable server" rule, so the two can be read the same way.
 *
 * Polling only runs while something is subscribed, and the interval is longer
 * than the self-hosted one because this is a remote server reached over mobile
 * data. When no cloud URL is configured there is nothing to reach, so the state
 * is set once and no timer is started.
 */
const POLL_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;

class SaasServerMonitor {
  private static instance: SaasServerMonitor;

  private state: SaasServerState = { status: "idle", isOnline: false };
  private listeners = new Set<Listener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;

  static getInstance(): SaasServerMonitor {
    if (!SaasServerMonitor.instance) {
      SaasServerMonitor.instance = new SaasServerMonitor();
    }
    return SaasServerMonitor.instance;
  }

  getSnapshot(): SaasServerState {
    return this.state;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    if (this.listeners.size === 1) {
      this.startPolling();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopPolling();
      }
    };
  }

  /** Trigger an immediate check outside of the scheduled interval. */
  async checkNow(): Promise<boolean> {
    await this.pollOnce();
    return this.state.isOnline;
  }

  private startPolling(): void {
    if (!STIRLING_SAAS_BACKEND_API_URL) {
      // Nothing to poll. Report it once instead of retrying a URL that does not exist.
      this.updateState({ status: "offline", isOnline: false });
      return;
    }
    if (this.intervalId !== null) {
      return;
    }
    if (this.state.status === "idle") {
      this.updateState({ status: "checking" });
    }
    void this.pollOnce();
    this.intervalId = setInterval(() => {
      void this.pollOnce();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (!STIRLING_SAAS_BACKEND_API_URL) {
      this.updateState({ status: "offline", isOnline: false });
      return;
    }
    // One request at a time, so a slow reply cannot stack up checks.
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.runCheck();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async runCheck(): Promise<void> {
    const base = STIRLING_SAAS_BACKEND_API_URL.replace(/\/$/, "");
    try {
      const response = await fetch(`${base}/api/v1/info/status`, {
        method: "GET",
        connectTimeout: REQUEST_TIMEOUT_MS,
      });

      // 401/403 means the server answered and wants credentials, so it is reachable.
      if (response.ok || response.status === 401 || response.status === 403) {
        this.updateState({ status: "online", isOnline: true });
      } else {
        this.updateState({ status: "offline", isOnline: false });
      }
    } catch {
      this.updateState({ status: "offline", isOnline: false });
    }
  }

  private updateState(partial: Partial<SaasServerState>): void {
    const next = { ...this.state, ...partial };
    const changed =
      next.status !== this.state.status ||
      next.isOnline !== this.state.isOnline;

    this.state = next;

    if (changed) {
      this.listeners.forEach((listener) => listener(this.state));
    }
  }
}

export const saasServerMonitor = SaasServerMonitor.getInstance();
