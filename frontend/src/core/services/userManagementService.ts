import apiClient from '@app/services/apiClient';

export interface User {
  id: number;
  username: string;
  email?: string;
  roleName: string; // Translation key like "adminUserSettings.admin"
  rolesAsString?: string; // Actual role ID like "ROLE_ADMIN"
  enabled: boolean;
  isFirstLogin?: boolean;
  authenticationType?: string;
  team?: {
    id: number;
    name: string;
  };
  createdAt?: string;
  updatedAt?: string;
  // Enriched client-side fields
  isActive?: boolean;
  lastRequest?: number; // timestamp in milliseconds
}

export interface AdminSettingsData {
  users: User[];
  userSessions: Record<string, boolean>;
  userLastRequest: Record<string, number>; // username -> timestamp in milliseconds
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  currentUsername?: string;
  roleDetails?: Record<string, string>;
  teams?: any[];
  maxPaidUsers?: number;
  // License information
  maxAllowedUsers: number;
  availableSlots: number;
  grandfatheredUserCount: number;
  licenseMaxUsers: number;
  premiumEnabled: boolean;
}

export interface CreateUserRequest {
  username: string;
  password?: string;
  role: string;
  teamId?: number;
  authType: 'password' | 'SSO';
  forceChange?: boolean;
}

export interface UpdateUserRoleRequest {
  username: string;
  role: string;
  teamId?: number;
}

export interface InviteUsersRequest {
  emails: string; // Comma-separated email addresses
  role: string;
  teamId?: number;
}

export interface InviteUsersResponse {
  successCount: number;
  failureCount: number;
  message?: string;
  errors?: string;
  error?: string;
}

/**
 * User Management Service
 * Provides functions to interact with user management backend APIs
 */
export const userManagementService = {
  /**
   * Get all users with session data (admin only)
   */
  async getUsers(): Promise<AdminSettingsData> {
    const response = await apiClient.get<AdminSettingsData>('/api/v1/proprietary/ui-data/admin-settings');
    return response.data;
  },

  /**
   * Get users without a team
   */
  async getUsersWithoutTeam(): Promise<User[]> {
    const response = await apiClient.get<User[]>('/api/v1/users/without-team');
    return response.data;
  },

  /**
   * Create a new user (admin only)
   */
  async createUser(data: CreateUserRequest): Promise<void> {
    const formData = new FormData();
    formData.append('username', data.username);
    if (data.password) {
      formData.append('password', data.password);
    }
    formData.append('role', data.role);
    if (data.teamId) {
      formData.append('teamId', data.teamId.toString());
    }
    formData.append('authType', data.authType);
    if (data.forceChange !== undefined) {
      formData.append('forceChange', data.forceChange.toString());
    }
    await apiClient.post('/api/v1/user/admin/saveUser', formData, {
      suppressErrorToast: true, // Component will handle error display
    } as any);
  },

  /**
   * Update user role and/or team (admin only)
   */
  async updateUserRole(data: UpdateUserRoleRequest): Promise<void> {
    const formData = new FormData();
    formData.append('username', data.username);
    formData.append('role', data.role);
    if (data.teamId) {
      formData.append('teamId', data.teamId.toString());
    }
    await apiClient.post('/api/v1/user/admin/changeRole', formData, {
      suppressErrorToast: true,
    } as any);
  },

  /**
   * Enable or disable a user (admin only)
   */
  async toggleUserEnabled(username: string, enabled: boolean): Promise<void> {
    const formData = new FormData();
    formData.append('enabled', enabled.toString());
    await apiClient.post(`/api/v1/user/admin/changeUserEnabled/${username}`, formData, {
      suppressErrorToast: true,
    } as any);
  },

  /**
   * Delete a user (admin only)
   */
  async deleteUser(username: string): Promise<void> {
    await apiClient.post(`/api/v1/user/admin/deleteUser/${username}`, null, {
      suppressErrorToast: true,
    } as any);
  },

  /**
   * Invite users via email (admin only)
   * Sends comma-separated email addresses, creates accounts with random passwords,
   * and sends invitation emails
   */
  async inviteUsers(data: InviteUsersRequest): Promise<InviteUsersResponse> {
    const formData = new FormData();
    formData.append('emails', data.emails);
    formData.append('role', data.role);
    if (data.teamId) {
      formData.append('teamId', data.teamId.toString());
    }

    const response = await apiClient.post<InviteUsersResponse>(
      '/api/v1/user/admin/inviteUsers',
      formData,
      {
        suppressErrorToast: true, // Component will handle error display
      } as any
    );

    return response.data;
  },
};
