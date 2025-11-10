import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBackendHealth } from '@app/hooks/useBackendHealth';

export interface DesktopBackendReadiness {
  ready: boolean;
  status: 'healthy' | 'starting' | 'unhealthy' | 'stopped';
  message: string | null;
}

export function useBackendReadiness(): DesktopBackendReadiness {
  const { status, error } = useBackendHealth(3000);
  const { t } = useTranslation();

  const readiness = useMemo<DesktopBackendReadiness>(() => {
    if (status === 'healthy') {
      return { ready: true, status, message: null };
    }

    if (status === 'stopped' || status === 'starting') {
      const message = t('backendHealth.checking', 'Checking backend status...');
      return {
        ready: false,
        status,
        message,
      };
    }

    return {
      ready: false,
      status,
      message: error || t('backendHealth.offline', 'Backend Offline'),
    };
  }, [status, error, t]);

  return readiness;
}
