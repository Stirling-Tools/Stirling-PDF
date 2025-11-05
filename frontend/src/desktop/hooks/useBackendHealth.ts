import { useState, useEffect, useCallback } from 'react';
import { tauriBackendService } from '@app/services/tauriBackendService';

export type BackendStatus = 'starting' | 'healthy' | 'unhealthy' | 'stopped';

interface BackendHealthState {
  status: BackendStatus;
  message?: string;
  lastChecked?: number;
  isChecking: boolean;
  error: string | null;
}

/**
 * Hook to monitor backend health status with retries
 */
export function useBackendHealth(pollingInterval = 5000) {
  const [health, setHealth] = useState<BackendHealthState>({
    status: tauriBackendService.isBackendRunning() ? 'healthy' : 'stopped',
    isChecking: false,
    error: null,
  });

  const checkHealth = useCallback(async () => {
    setHealth((current) => ({
      ...current,
      status: current.status === 'healthy' ? 'healthy' : 'starting',
      isChecking: true,
      error: 'Backend starting up...',
      lastChecked: Date.now(),
    }));

    try {
      const isHealthy = await tauriBackendService.checkBackendHealth();

      setHealth({
        status: isHealthy ? 'healthy' : 'unhealthy',
        lastChecked: Date.now(),
        message: isHealthy ? 'Backend is healthy' : 'Backend is unavailable',
        isChecking: false,
        error: isHealthy ? null : 'Backend offline',
      });

      return isHealthy;
    } catch (error) {
      console.error('[BackendHealth] Health check failed:', error);
      setHealth({
        status: 'unhealthy',
        lastChecked: Date.now(),
        message: 'Backend is unavailable',
        isChecking: false,
        error: 'Backend offline',
      });
      return false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      setHealth((current) => ({
        ...current,
        status: tauriBackendService.isBackendRunning() ? 'starting' : 'stopped',
        isChecking: true,
        error: 'Backend starting up...',
      }));

      await checkHealth();
      if (!isMounted) return;
    };

    initialize();

    const interval = setInterval(() => {
      if (!isMounted) return;
      void checkHealth();
    }, pollingInterval);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [checkHealth, pollingInterval]);

  return {
    ...health,
    isHealthy: health.status === 'healthy',
    checkHealth,
  };
}
