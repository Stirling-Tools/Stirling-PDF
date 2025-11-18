import { useCallback, useMemo, useState } from 'react';

export type DevFlow = 'no-login' | 'login-admin' | 'login-user';

export interface DevScenarioButton {
  label: string;
  flow: DevFlow;
  overLimit: boolean;
}

export interface DevOverrides {
  enableLogin?: boolean;
  isAdmin?: boolean;
  licenseUserCount?: number | null;
}

interface UseDevScenariosOptions {
  opened: boolean;
  isDevMode: boolean;
  onApplyScenario: (payload: {
    selectedRole: 'admin' | 'user' | null;
    selfReportedAdmin: boolean;
  }) => void;
}

export function useDevScenarios({ opened, isDevMode, onApplyScenario }: UseDevScenariosOptions) {
  const [devOverrides, setDevOverrides] = useState<DevOverrides | null>(null);
  const [activeDevScenario, setActiveDevScenario] = useState<string | null>(null);

  const devButtons: DevScenarioButton[] = useMemo(() => {
    if (!isDevMode || !opened) {
      return [];
    }

    return [
      { label: 'no-login', flow: 'no-login', overLimit: false },
      { label: 'admin-login', flow: 'login-admin', overLimit: false },
      { label: 'admin 57', flow: 'login-admin', overLimit: true },
      { label: 'user-login', flow: 'login-user', overLimit: false },
    ];
  }, [isDevMode, opened]);

  const handleDevScenarioClick = useCallback(
    (scenario: DevScenarioButton) => {
      if (!isDevMode) {
        return;
      }

      const { flow, overLimit, label } = scenario;
      const overrides: DevOverrides = {};
      let newSelectedRole: 'admin' | 'user' | null = null;
      let newSelfReportedAdmin = false;

      switch (flow) {
        case 'no-login':
          overrides.enableLogin = false;
          overrides.isAdmin = false;
          newSelfReportedAdmin = true;
          newSelectedRole = 'admin';
          break;
        case 'login-admin':
          overrides.enableLogin = true;
          overrides.isAdmin = true;
          newSelectedRole = 'admin';
          break;
        case 'login-user':
        default:
          overrides.enableLogin = true;
          overrides.isAdmin = false;
          newSelectedRole = 'user';
          break;
      }

      overrides.licenseUserCount = overLimit ? 57 : 3;

      setDevOverrides(overrides);
      setActiveDevScenario(label);
      onApplyScenario({
        selectedRole: newSelectedRole,
        selfReportedAdmin: newSelfReportedAdmin,
      });
    },
    [isDevMode, onApplyScenario],
  );

  return {
    devButtons,
    activeDevScenario,
    handleDevScenarioClick,
    devOverrides,
  };
}

