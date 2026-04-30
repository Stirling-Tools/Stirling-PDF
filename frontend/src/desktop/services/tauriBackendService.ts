import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { alert } from "@app/components/toast";

export type BackendStatus = "stopped" | "starting" | "healthy" | "unhealthy";

export class TauriBackendService {
  private static instance: TauriBackendService;
  private backendStarted = false;
  private backendStatus: BackendStatus = "stopped";
  private backendPort: number | null = null;
  private healthMonitor: Promise<void> | null = null;
  private startPromise: Promise<void> | null = null;
  private statusListeners = new Set<(status: BackendStatus) => void>();
  /** True when we own the backend process (startBackend called, not initializeExternalBackend) */
  private isLocalBackend = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private isRecovering = false;
  private restartAttempts = 0;
  private static readonly MAX_RESTART_ATTEMPTS = 3;

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
    return this.backendStatus === "healthy";
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
    this.statusListeners.forEach((listener) => listener(status));

    if (status === "healthy") {
      // Reset restart counter on successful recovery so future failures get a full retry budget.
      this.restartAttempts = 0;
    }

    // Auto-recovery: when our own backend goes unhealthy, try restarting it
    // before reporting as permanently offline.
    if (status === "unhealthy" && this.isLocalBackend && !this.isRecovering) {
      this.scheduleRecovery();
    }
  }

  private scheduleRecovery() {
    if (this.recoveryTimer) return;
    // Give it a 2s grace period — transient failures (e.g. during logout/reload)
    // should resolve on their own before we attempt a full restart.
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.backendStatus !== "unhealthy") return; // Recovered on its own
      void this.attemptRestart();
    }, 2000);
  }

  async attemptRestart(): Promise<void> {
    if (this.isRecovering) return;
    if (this.restartAttempts >= TauriBackendService.MAX_RESTART_ATTEMPTS) {
      console.error(
        `[TauriBackendService] Backend failed after ${TauriBackendService.MAX_RESTART_ATTEMPTS} restart attempts, giving up.`,
      );
      alert({
        alertType: "error",
        title: "Backend failed to restart",
        body: "The local backend could not be recovered. Please restart the app.",
        isPersistentPopup: true,
      });
      return;
    }
    this.restartAttempts++;
    console.log(
      `[TauriBackendService] Backend unhealthy, attempting restart (${this.restartAttempts}/${TauriBackendService.MAX_RESTART_ATTEMPTS})...`,
    );
    alert({
      alertType: "warning",
      title: "Backend stopped unexpectedly",
      body: `Attempting to restart... (${this.restartAttempts}/${TauriBackendService.MAX_RESTART_ATTEMPTS})`,
      durationMs: 5000,
    });
    this.isRecovering = true;
    // Reset started flag so startBackend() will run again
    this.backendStarted = false;
    this.startPromise = null;
    this.setStatus("starting");
    try {
      await this.startBackend();
      this.restartAttempts = 0; // Reset on successful restart
      this.isRecovering = false;
      console.log("[TauriBackendService] Backend restarted successfully.");
      alert({
        alertType: "success",
        title: "Backend restarted",
        body: "The local backend is back online.",
        durationMs: 4000,
      });
    } catch (err) {
      console.error("[TauriBackendService] Restart failed:", err);
      // Set isRecovering = false BEFORE setStatus to prevent re-triggering scheduleRecovery
      // if the max attempts check above doesn't catch it next time.
      this.isRecovering = false;
      if (this.restartAttempts < TauriBackendService.MAX_RESTART_ATTEMPTS) {
        this.setStatus("unhealthy"); // Will trigger another scheduleRecovery
      } else {
        // Don't call setStatus('unhealthy') — the status is already unhealthy and calling it
        // again would bypass the dedup check and re-trigger scheduleRecovery.
        console.error(
          "[TauriBackendService] Max restart attempts reached, backend is permanently unhealthy.",
        );
      }
    }
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
    this.setStatus("starting");
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

    this.isLocalBackend = true; // We own this backend process

    if (this.startPromise) {
      return this.startPromise;
    }

    this.setStatus("starting");

    this.startPromise = invoke("start_backend", { backendUrl })
      .then(async () => {
        this.backendStarted = true;
        this.setStatus("starting");

        // Poll for the dynamically assigned port
        await this.waitForPort();
        this.beginHealthMonitoring();
      })
      .catch((error) => {
        this.setStatus("unhealthy");
        console.error("[TauriBackendService] Failed to start backend:", error);
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
        const port = await invoke<number | null>("get_backend_port");
        if (port) {
          this.backendPort = port;
          // Notify status listeners so hooks reading getBackendUrl() re-evaluate
          this.statusListeners.forEach((listener) =>
            listener(this.backendStatus),
          );
          return;
        }
      } catch (error) {
        console.error("Failed to get backend port:", error);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private beginHealthMonitoring() {
    if (this.healthMonitor) {
      return;
    }
    this.healthMonitor = this.waitForHealthy()
      .catch((error) => {
        console.error("Backend failed to become healthy:", error);
      })
      .finally(() => {
        this.healthMonitor = null;
      });
  }

  /** Always checks the local bundled backend at localhost:{port}. */
  async checkBackendHealth(): Promise<boolean> {
    if (!this.backendStarted) {
      console.debug("[TauriBackendService] Health check: backend not started");
      this.setStatus("stopped");
      return false;
    }
    if (!this.backendPort) {
      console.debug(
        "[TauriBackendService] Health check: backend port not available",
      );
      return false;
    }

    const configUrl = `http://localhost:${this.backendPort}/api/v1/config/app-config`;
    console.debug(
      `[TauriBackendService] Checking local backend health at: ${configUrl}`,
    );

    try {
      const response = await fetch(configUrl, {
        method: "GET",
        connectTimeout: 5000,
      });

      if (!response.ok) {
        console.warn(
          `[TauriBackendService] Health check failed: ${response.status}`,
        );
        this.setStatus("unhealthy");
        return false;
      }

      const data = await response.json();
      const dependenciesReady = data.dependenciesReady === true;
      console.debug(
        `[TauriBackendService] dependenciesReady=${dependenciesReady}`,
      );

      this.setStatus(dependenciesReady ? "healthy" : "starting");
      return dependenciesReady;
    } catch (error) {
      console.error("[TauriBackendService] Health check error:", error);
      this.setStatus("unhealthy");
      return false;
    }
  }

  private async waitForHealthy(): Promise<void> {
    while (true) {
      const isHealthy = await this.checkBackendHealth();
      if (isHealthy) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Reset backend state (used when switching from external to local backend)
   */
  reset(): void {
    this.backendStarted = false;
    this.backendPort = null;
    this.isLocalBackend = false;
    this.isRecovering = false;
    this.restartAttempts = 0;
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    this.setStatus("stopped");
    this.healthMonitor = null;
    this.startPromise = null;
  }
}

export const tauriBackendService = TauriBackendService.getInstance();
