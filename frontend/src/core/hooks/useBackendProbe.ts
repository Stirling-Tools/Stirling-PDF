import { useCallback, useEffect, useState } from 'react';
import { BASE_PATH } from '@app/constants/app';

type BackendStatus = 'up' | 'starting' | 'down';

interface BackendProbeState {
  status: BackendStatus;
  loginDisabled: boolean;
  loading: boolean;
}

/**
 * Lightweight backend probe that avoids global axios interceptors.
 * Used on auth screens to decide whether to show login, anonymous mode, or a backend-starting message.
 */
export function useBackendProbe() {
  const [state, setState] = useState<BackendProbeState>({
    status: 'starting',
    loginDisabled: false,
    loading: true,
  });

  const probe = useCallback(async () => {
    const statusUrl = `${BASE_PATH || ''}/api/v1/info/status`;
    const loginUrl = `${BASE_PATH || ''}/api/v1/proprietary/ui-data/login`;

    const next: BackendProbeState = {
      status: 'starting',
      loginDisabled: false,
      loading: false,
    };

    try {
      const res = await fetch(statusUrl, { method: 'GET', cache: 'no-store' });
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

    // Fallback: proprietary login endpoint to detect disabled login and backend availability
    try {
      const res = await fetch(loginUrl, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        next.status = 'up';
        const data = await res.json().catch(() => null);
        if (data && data.enableLogin === false) {
          next.loginDisabled = true;
        }
      } else if (res.status === 404) {
        // Endpoint missing usually means login disabled
        next.status = 'up';
        next.loginDisabled = true;
      } else if (res.status === 503) {
        next.status = 'starting';
      } else {
        next.status = 'down';
      }
    } catch {
      // keep previous inferred state (down/starting)
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
