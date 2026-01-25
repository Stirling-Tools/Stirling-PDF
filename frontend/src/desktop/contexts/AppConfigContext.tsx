import { useEffect, useMemo, useState } from 'react';
import {
  AppConfigProvider as CoreAppConfigProvider,
  useAppConfig as useCoreAppConfig,
} from '@core/contexts/AppConfigContext';
import type { ConnectionMode } from '@app/services/connectionModeService';
import { connectionModeService } from '@app/services/connectionModeService';

export type { AppConfig, AppConfigProviderProps, AppConfigRetryOptions } from '@core/contexts/AppConfigContext';
export const AppConfigProvider = CoreAppConfigProvider;

/**
 * Desktop override that forces login-enabled behavior while in SaaS mode.
 * The bundled backend always reports enableLogin=false, but SaaS desktop
 * still requires the proprietary login flow. Override the config so UI
 * routes continue to show the login experience.
 */
export function useAppConfig() {
  const value = useCoreAppConfig();
  const [mode, setMode] = useState<ConnectionMode>('saas');

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        const current = await connectionModeService.getCurrentConfig();
        setMode(current.mode);
        unsubscribe = connectionModeService.subscribeToModeChanges((config) => {
          setMode(config.mode);
        });
      } catch (error) {
        console.error('[Desktop AppConfig] Failed to load connection mode:', error);
      }
    };

    void init();
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const effectiveConfig = useMemo(() => {
    if (!value.config) {
      return value.config;
    }

    if (mode === 'saas') {
      return {
        ...value.config,
        enableLogin: true,
      };
    }

    return value.config;
  }, [mode, value.config]);

  return {
    ...value,
    config: effectiveConfig,
  };
}
