import { useState, useEffect, useCallback } from 'react';
import { backendService } from '../services/backendService';

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
      const isHealthy = await backendService.checkHealth();
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
      
      // Don't show error during initial startup period
      const errorMessage = isWithinStartupPeriod 
        ? 'Backend starting up...' 
        : (error instanceof Error ? error.message : 'Health check failed');
      
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