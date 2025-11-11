export type BackendStatus = 'stopped' | 'starting' | 'healthy' | 'unhealthy';

export interface BackendHealthState {
  status: BackendStatus;
  message?: string | null;
  lastChecked?: number;
  isChecking: boolean;
  error: string | null;
  isHealthy: boolean;
}
