/**
 * Inert replacement for the desktop bundled-backend service.
 *
 * Mobile never has a local Stirling backend: there is no JVM on iOS/Android and
 * every operation goes to the connected server. The desktop service would
 * otherwise treat the stubbed `start_backend` rejection as a crash and run its
 * restart/alert loop ("Backend stopped unexpectedly"). This keeps the same
 * public surface so shared desktop code keeps working, but reports the backend
 * as permanently stopped and never alerts.
 */

export type BackendStatus = "stopped" | "starting" | "healthy" | "unhealthy";

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
