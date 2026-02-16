import { MfaSetupResponse } from '@app/responses/Mfa/MfaResponse';
import apiClient from '@app/services/apiClient';

export interface AccountData {
  username: string;
  role: string;
  settings: string; // JSON string of settings
  changeCredsFlag: boolean;
  oAuth2Login: boolean;
  saml2Login: boolean;
  mfaEnabled?: boolean;
}

export interface LoginPageData {
  showDefaultCredentials: boolean;
  firstTimeSetup: boolean;
  enableLogin: boolean;
  ssoAutoLogin?: boolean;
}

/**
 * Account Service
 * Provides functions to interact with account-related backend APIs
 */
export const accountService = {
  /**
   * Get login page data (includes showDefaultCredentials flag)
   * This is a public endpoint - doesn't require authentication
   */
  async getLoginPageData(): Promise<LoginPageData> {
    const response = await apiClient.get<LoginPageData>('/api/v1/proprietary/ui-data/login');
    return response.data;
  },

  /**
   * Get current user account data
   */
  async getAccountData(options?: { suppressErrorToast?: boolean; skipAuthRedirect?: boolean }): Promise<AccountData> {
    const response = await apiClient.get<AccountData>('/api/v1/proprietary/ui-data/account', {
      suppressErrorToast: options?.suppressErrorToast,
      skipAuthRedirect: options?.skipAuthRedirect,
    });
    return response.data;
  },

  /**
   * Change user password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const formData = new FormData();
    formData.append('currentPassword', currentPassword);
    formData.append('newPassword', newPassword);
    await apiClient.post('/api/v1/user/change-password', formData);
  },

  /**
   * Change user password on first login (resets firstLogin flag)
   */
  async changePasswordOnLogin(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    const formData = new FormData();
    formData.append('currentPassword', currentPassword);
    formData.append('newPassword', newPassword);
    formData.append('confirmPassword', confirmPassword);
    await apiClient.post('/api/v1/user/change-password-on-login', formData, { responseType: 'json'});
  },

  /**
   * Change username
   */
  async changeUsername(newUsername: string, currentPassword: string): Promise<void> {
    const formData = new FormData();
    formData.append('currentPasswordChangeUsername', currentPassword);
    formData.append('newUsername', newUsername);
    await apiClient.post('/api/v1/user/change-username', formData);
  },

  async requestMfaSetup(): Promise<MfaSetupResponse> {
    const response = await apiClient.get<MfaSetupResponse>('/api/v1/auth/mfa/setup', { suppressErrorToast: true });
    return response.data;
  },

  async enableMfa(code: string): Promise<void> {
    await apiClient.post('/api/v1/auth/mfa/enable', { code }, { skipAuthRedirect: true });
  },

  async disableMfa(code: string): Promise<void> {
    await apiClient.post('/api/v1/auth/mfa/disable', { code }, { skipAuthRedirect: true });
  },

  async cancelMfaSetup(): Promise<void> {
    await apiClient.post('/api/v1/auth/mfa/setup/cancel', undefined, { suppressErrorToast: true });
  },
};
