import { useAppConfig } from '@app/contexts/AppConfigContext';
import { alert } from '@app/components/toast';
import { useTranslation } from 'react-i18next';

/**
 * Hook to manage login-required functionality in admin sections
 * Provides login state, validation, and alert functionality
 */
export function useLoginRequired() {
  const { config } = useAppConfig();
  const { t } = useTranslation();
  const loginEnabled = config?.enableLogin ?? true;

  /**
   * Show alert when user tries to modify settings with login disabled
   */
  const showLoginRequiredAlert = () => {
    alert({
      alertType: 'warning',
      title: t('admin.error', 'Error'),
      body: t('admin.settings.loginRequired', 'Login mode must be enabled to modify admin settings'),
    });
  };

  /**
   * Validate that login is enabled before allowing action
   * Returns true if login is enabled, false otherwise (and shows alert)
   */
  const validateLoginEnabled = (): boolean => {
    if (!loginEnabled) {
      showLoginRequiredAlert();
      return false;
    }
    return true;
  };

  /**
   * Wrap an async handler to check login state before executing
   */
  const withLoginCheck = <T extends (...args: any[]) => Promise<any>>(
    handler: T
  ): T => {
    return (async (...args: any[]) => {
      if (!validateLoginEnabled()) {
        return;
      }
      return handler(...args);
    }) as T;
  };

  /**
   * Get styles for disabled inputs (cursor not-allowed)
   */
  const getDisabledStyles = () => {
    if (!loginEnabled) {
      return {
        input: { cursor: 'not-allowed' },
        track: { cursor: 'not-allowed' },
        thumb: { cursor: 'not-allowed' }
      };
    }
    return undefined;
  };

  /**
   * Wrap fetch function to skip API call when login disabled
   */
  const withLoginCheckForFetch = <T extends (...args: any[]) => Promise<any>>(
    fetchHandler: T,
    skipWhenDisabled: boolean = true
  ): T => {
    return (async (...args: any[]) => {
      if (!loginEnabled && skipWhenDisabled) {
        // Skip fetch when login disabled - component will use default/empty values
        return;
      }
      return fetchHandler(...args);
    }) as T;
  };

  return {
    loginEnabled,
    showLoginRequiredAlert,
    validateLoginEnabled,
    withLoginCheck,
    withLoginCheckForFetch,
    getDisabledStyles,
  };
}
