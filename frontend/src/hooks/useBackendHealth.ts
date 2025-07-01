import { useState, useEffect, useCallback } from 'react';
import { makeApiUrl } from '../utils/api';

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
      // Direct HTTP call to backend health endpoint using api.ts
      const healthUrl = makeApiUrl('/api/v1/info/status');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      const isHealthy = response.ok;
      
      setHealthState({
        isHealthy,
        isChecking: false,
        lastChecked: new Date(),
        error: null,
      });
      
      if (isHealthy) {
        setAttemptCount(0); // Reset attempt count on success
      }
    } catch (error) {
      const now = new Date();
      const timeSinceStartup = now.getTime() - startupTime.getTime();
      const isWithinStartupPeriod = timeSinceStartup < 60000; // 60 seconds
      
      let errorMessage: string;
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = isWithinStartupPeriod ? 'Backend starting up...' : 'Health check timeout';
        } else if (error.message.includes('fetch')) {
          errorMessage = isWithinStartupPeriod ? 'Backend starting up...' : 'Cannot connect to backend';
        } else {
          errorMessage = isWithinStartupPeriod ? 'Backend starting up...' : error.message;
        }
      } else {
        errorMessage = isWithinStartupPeriod ? 'Backend starting up...' : 'Health check failed';
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