import { useCallback, useEffect, useState } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';
import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';

type BackendStatus = 'up' | 'starting' | 'down';

interface BackendProbeState {
  status: BackendStatus;
  loginDisabled: boolean;
  loading: boolean;
}

/**
 * Desktop override of useBackendProbe.
 * Hits the local/remote backend directly via the Tauri HTTP client.
 */
export function useBackendProbe() {
  const [state, setState] = useState<BackendProbeState>({
    status: 'starting',
    loginDisabled: false,
    loading: true,
  });

  const probe = useCallback(async () => {
    const baseUrl = await resolveProbeBaseUrl();
    if (!baseUrl) {
      const pendingState: BackendProbeState = {
        status: 'starting',
        loginDisabled: false,
        loading: false,
      };
      setState(pendingState);
      return pendingState;
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
      // keep existing inferred state (down/starting)
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

async function resolveProbeBaseUrl(): Promise<string | null> {
  try {
    const config = await connectionModeService.getCurrentConfig();
    if (config.mode === 'selfhosted') {
      const serverUrl = config.server_config?.url;
      if (!serverUrl) {
        return null;
      }
      return stripTrailingSlash(serverUrl);
    }

    const directUrl = tauriBackendService.getBackendUrl();
    if (directUrl) {
      return stripTrailingSlash(directUrl);
    }

    const port = await invoke<number | null>('get_backend_port').catch(() => null);
    if (!port) {
      return null;
    }
    return stripTrailingSlash(`http://localhost:${port}`);
  } catch (error) {
    console.error('[Desktop useBackendProbe] Failed to resolve backend URL:', error);
    return null;
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}
