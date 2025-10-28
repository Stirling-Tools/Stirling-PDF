import { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';

export interface BackendHealthState {
  isHealthy: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  error: string | null;
}

export const useBackendHealth = (checkInterval: number = 2000) => {
  const [healthState, setHealthState] = useState<BackendHealthState>({
    isHealthy: false,
    isChecking: false,
    lastChecked: null,
    error: null,
  });

  const [startupTime] = useState<Date>(new Date());
  const [attemptCount, setAttemptCount] = useState<number>(0);

  const checkHealth = useCallback(async () => {
    setHealthState(prev => ({ ...prev, isChecking: true, error: null }));
    setAttemptCount(prev => prev + 1);

    try {
      // Direct HTTP call to backend health endpoint using axios
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await apiClient.get('/api/v1/info/status', {
        signal: controller.signal,
        skipErrorToast: true, // Don't show error toasts for health check failures
      });

      clearTimeout(timeoutId);

      const isHealthy = response.status === 200;
      
      setHealthState({
        isHealthy,
        isChecking: false,
        lastChecked: new Date(),
        error: null,
      });
      
      if (isHealthy) {
        // Log success message if this is the first successful check after failures
        if (attemptCount > 0) {
          const now = new Date();
          const timeSinceStartup = now.getTime() - startupTime.getTime();
          console.log('✅ Backend health check successful:', {
            timeSinceStartup: Math.round(timeSinceStartup / 1000) + 's',
            attemptsBeforeSuccess: attemptCount,
          });
        }
        setAttemptCount(0); // Reset attempt count on success
      }
    } catch (error: any) {
      const now = new Date();
      const timeSinceStartup = now.getTime() - startupTime.getTime();
      const isWithinStartupPeriod = timeSinceStartup < 60000; // 60 seconds

      let errorMessage: string;

      // Handle axios errors
      if (error.name === 'CanceledError' || error.code === 'ECONNABORTED') {
        errorMessage = isWithinStartupPeriod ? 'Backend starting up...' : 'Health check timeout';
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
        errorMessage = isWithinStartupPeriod ? 'Backend starting up...' : 'Cannot connect to backend';
      } else {
        errorMessage = isWithinStartupPeriod ? 'Backend starting up...' : (error.message || 'Health check failed');
      }
      
      // Only log errors to console after startup period
      if (!isWithinStartupPeriod) {
        console.error('Backend health check failed:', {
          error: error?.message || error,
          code: error?.code,
          status: error?.response?.status,
          timeSinceStartup: Math.round(timeSinceStartup / 1000) + 's',
          attemptCount,
        });
      } else {
        // During startup, only log on first few attempts to reduce noise
        if (attemptCount <= 3) {
          console.log('Backend health check (startup period):', {
            message: errorMessage,
            timeSinceStartup: Math.round(timeSinceStartup / 1000) + 's',
            attempt: attemptCount,
          });
        }
      }
      
      setHealthState({
        isHealthy: false,
        isChecking: false,
        lastChecked: new Date(),
        error: errorMessage,
      });
    }
  }, [startupTime]);

  useEffect(() => {
    // Initial health check
    checkHealth();

    // Set up periodic health checks
    const interval = setInterval(checkHealth, checkInterval);

    return () => clearInterval(interval);
  }, [checkHealth, checkInterval]);

  return {
    ...healthState,
    checkHealth,
  };
};