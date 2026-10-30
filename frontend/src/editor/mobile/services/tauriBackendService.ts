export type BackendStatus = "stopped" | "starting" | "healthy" | "unhealthy";

/**
 * The bundled-backend seam `tauri/` reads, for a platform that has none.
 *
 * There is no JVM on iOS or Android, so every operation goes to the connected
 * server. This keeps the seam's public surface but reports the backend as
 * permanently stopped and never alerts.
 */
export class TauriBackendService {
  private static instance: TauriBackendService;

  static getInstance(): TauriBackendService {
    if (!TauriBackendService.instance) {
      TauriBackendService.instance = new TauriBackendService();
    }
    return TauriBackendService.instance;
  }

  isBackendRunning(): boolean {
    return false;
  }

  getBackendStatus(): BackendStatus {
    return "stopped";
  }

  get isOnline(): boolean {
    return false;
  }

  getBackendPort(): number | null {
    return null;
  }

  getBackendUrl(): string | null {
    return null;
  }

  /** Status never changes, so there is nothing to notify. */
  subscribeToStatus(_listener: (status: BackendStatus) => void): () => void {
    return () => {};
  }

  async attemptRestart(): Promise<void> {}

  async initializeExternalBackend(): Promise<void> {}

  async startBackend(_backendUrl?: string): Promise<void> {
    console.debug(
      "[TauriBackendService] No bundled backend on mobile; operations use the connected server.",
    );
  }

  async checkBackendHealth(): Promise<boolean> {
    return false;
  }

  reset(): void {}
}

export const tauriBackendService = TauriBackendService.getInstance();
