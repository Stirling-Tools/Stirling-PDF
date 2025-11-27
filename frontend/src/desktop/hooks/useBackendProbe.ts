import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService, type BackendStatus as ServiceBackendStatus } from '@app/services/tauriBackendService';

type ConnectionMode = 'saas' | 'selfhosted';

type ProbeStatus = 'up' | 'starting' | 'down';

interface BackendProbeState {
  status: ProbeStatus;
  loginDisabled: boolean;
  loading: boolean;
}

/**
 * Desktop-specific backend probe.
 *
 * In SaaS mode we trust the embedded backend's health status exposed by tauriBackendService,
 * avoiding redundant HTTP polling that was preventing the Login/Landing screens from advancing.
 * In self-hosted mode we still hit the remote server directly to detect login-disabled state.
 */
export function useBackendProbe() {
  const initialStatus = useMemo(() => mapServiceStatus(tauriBackendService.getBackendStatus()), []);
  const [state, setState] = useState<BackendProbeState>({
    status: initialStatus,
    loginDisabled: false,
    loading: true,
  });
  const modeRef = useRef<ConnectionMode>('saas');

  // Track connection mode so the probe knows when to fall back to remote HTTP checks.
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    connectionModeService.getCurrentConfig()
      .then((config) => {
        modeRef.current = config.mode;
        unsubscribe = connectionModeService.subscribeToModeChanges((nextConfig) => {
          modeRef.current = nextConfig.mode;
        });
      })
      .catch((error) => {
        console.error('[Desktop useBackendProbe] Failed to load connection mode:', error);
      });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // React to backend health updates coming from the shared tauriBackendService.
  useEffect(() => {
    const unsubscribe = tauriBackendService.subscribeToStatus((serviceStatus) => {
      setState((prev) => ({
        ...prev,
        status: mapServiceStatus(serviceStatus),
        loading: false,
      }));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const probe = useCallback(async () => {
    const mode = modeRef.current;
    const serviceStatus = tauriBackendService.getBackendStatus();

    if (mode === 'saas') {
      // SaaS desktop always relies on the embedded backend. Kick off a health check if needed.
      if (serviceStatus !== 'healthy') {
        void tauriBackendService.checkBackendHealth();
      }
      const nextState: BackendProbeState = {
        status: mapServiceStatus(serviceStatus),
        loginDisabled: false,
        loading: false,
      };
      setState(nextState);
      return nextState;
    }

    const baseUrl = await resolveRemoteBaseUrl();
    if (!baseUrl) {
      const pending: BackendProbeState = {
        status: 'starting',
        loginDisabled: false,
        loading: false,
      };
      setState(pending);
      return pending;
    }

    const statusUrl = `${baseUrl}/api/v1/info/status`;
    const loginUrl = `${baseUrl}/api/v1/proprietary/ui-data/login`;

    const next: BackendProbeState = {
      status: 'starting',
      loginDisabled: false,
      loading: false,
    };

    try {
      const res = await fetch(statusUrl, { method: 'GET', connectTimeout: 5000 });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.status === 'UP') {
          next.status = 'up';
          setState(next);
          return next;
        }
        next.status = 'starting';
      } else if (res.status === 404 || res.status === 503) {
        next.status = 'starting';
      } else {
        next.status = 'down';
      }
    } catch {
      next.status = 'down';
    }

    try {
      const res = await fetch(loginUrl, { method: 'GET', connectTimeout: 5000 });
      if (res.ok) {
        next.status = 'up';
        const data = await res.json().catch(() => null);
        if (data && data.enableLogin === false) {
          next.loginDisabled = true;
        }
      } else if (res.status === 404) {
        next.status = 'up';
        next.loginDisabled = true;
      } else if (res.status === 503) {
        next.status = 'starting';
      } else {
        next.status = 'down';
      }
    } catch {
      // keep inferred state
    }

    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  return {
    ...state,
    probe,
  };
}

async function resolveRemoteBaseUrl(): Promise<string | null> {
  try {
    const config = await connectionModeService.getCurrentConfig();
    if (config.mode !== 'selfhosted') {
      return null;
    }
    const serverUrl = config.server_config?.url;
    if (!serverUrl) {
      return null;
    }
    return stripTrailingSlash(serverUrl);
  } catch (error) {
    console.error('[Desktop useBackendProbe] Failed to resolve remote backend URL:', error);
    return null;
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function mapServiceStatus(status: ServiceBackendStatus): ProbeStatus {
  if (status === 'healthy') {
    return 'up';
  }
  if (status === 'unhealthy') {
    return 'down';
  }
  return 'starting';
}
