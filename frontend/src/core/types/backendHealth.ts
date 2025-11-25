export type BackendStatus = 'stopped' | 'starting' | 'healthy' | 'unhealthy';

export interface BackendHealthState {
  status: BackendStatus;
  message?: string | null;
  error: string | null;
  isHealthy: boolean;
}
