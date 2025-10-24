import { useAuth } from '@app/auth/UseSession';
import { useAppConfig } from '@app/hooks/useAppConfig';

export function useOnboardingAccess() {
  const { session, loading: authLoading } = useAuth();
  const { config, loading: configLoading } = useAppConfig();

  const loginDisabled = config?.enableLogin === false;

  return {
    allowed: loginDisabled || Boolean(session),
    loading: authLoading || configLoading,
  };
}
