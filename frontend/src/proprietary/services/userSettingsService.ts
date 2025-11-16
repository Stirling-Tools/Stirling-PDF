import apiClient from '@app/services/apiClient';

export interface UserSettingsResponse {
  settings: Record<string, string>;
}

export const userSettingsService = {
  async fetch(): Promise<UserSettingsResponse> {
    const response = await apiClient.get<UserSettingsResponse>('/api/v1/user/settings');
    return response.data;
  },

  async save(settings: Record<string, string>): Promise<UserSettingsResponse> {
    const response = await apiClient.put<UserSettingsResponse>('/api/v1/user/settings', {
      settings,
    });
    return response.data;
  },
};
