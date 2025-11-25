import { useEffect, useState } from 'react';
import {
  UPGRADE_BANNER_ALERT_EVENT,
  type UpgradeBannerAlertPayload,
} from '@app/constants/events';

export interface LicenseAlertState {
  active: boolean;
  audience: 'admin' | 'user' | null;
  totalUsers: number | null;
  freeTierLimit: number;
}

const defaultState: LicenseAlertState = {
  active: false,
  audience: null,
  totalUsers: null,
  freeTierLimit: 5,
};

export function useLicenseAlert(): LicenseAlertState {
  const [state, setState] = useState<LicenseAlertState>(defaultState);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleAlert = (event: Event) => {
      const detail = (event as CustomEvent<UpgradeBannerAlertPayload>).detail;
      if (detail?.active) {
        setState({
          active: true,
          audience: detail.audience ?? 'user',
          totalUsers:
            typeof detail.totalUsers === 'number' ? detail.totalUsers : null,
          freeTierLimit: detail.freeTierLimit ?? 5,
        });
      } else {
        setState(defaultState);
      }
    };

    window.addEventListener(UPGRADE_BANNER_ALERT_EVENT, handleAlert as EventListener);

    return () => {
      window.removeEventListener(UPGRADE_BANNER_ALERT_EVENT, handleAlert as EventListener);
    };
  }, []);

  return state;
}

