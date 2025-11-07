import apiClient from '@app/services/apiClient';
import type { AxiosRequestConfig } from 'axios';

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
  teams?: TeamSummary[];
  maxPaidUsers?: number;
  // License information
  maxAllowedUsers: number;
  availableSlots: number;
  grandfatheredUserCount: number;
  licenseMaxUsers: number;
  premiumEnabled: boolean;
}

export interface TeamSummary {
  id: number;
  name: string;
  memberCount?: number;
  [key: string]: unknown;
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

export interface InviteLinkRequest {
  email: string;
  role: string;
  teamId?: number;
  expiryHours?: number;
  sendEmail?: boolean;
}

export interface InviteLinkResponse {
  token: string;
  inviteUrl: string;
  email: string;
  expiresAt: string;
  expiryHours: number;
  emailSent?: boolean;
  emailError?: string;
  error?: string;
}

export interface InviteToken {
  id: number;
  email: string;
  role: string;
  teamId?: number;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
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
    const config: AxiosRequestConfig & { suppressErrorToast?: boolean } = {
      suppressErrorToast: true,
    };
    await apiClient.post('/api/v1/user/admin/saveUser', formData, config);
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
    const config: AxiosRequestConfig & { suppressErrorToast?: boolean } = {
      suppressErrorToast: true,
    };
    await apiClient.post('/api/v1/user/admin/changeRole', formData, config);
  },

  /**
   * Enable or disable a user (admin only)
   */
  async toggleUserEnabled(username: string, enabled: boolean): Promise<void> {
    const formData = new FormData();
    formData.append('enabled', enabled.toString());
    const config: AxiosRequestConfig & { suppressErrorToast?: boolean } = {
      suppressErrorToast: true,
    };
    await apiClient.post(`/api/v1/user/admin/changeUserEnabled/${username}`, formData, config);
  },

  /**
   * Delete a user (admin only)
   */
  async deleteUser(username: string): Promise<void> {
    const config: AxiosRequestConfig & { suppressErrorToast?: boolean } = {
      suppressErrorToast: true,
    };
    await apiClient.post(`/api/v1/user/admin/deleteUser/${username}`, null, config);
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

    const config: AxiosRequestConfig & { suppressErrorToast?: boolean } = {
      suppressErrorToast: true,
    };

    const response = await apiClient.post<InviteUsersResponse>(
      '/api/v1/user/admin/inviteUsers',
      formData,
      config
    );

    return response.data;
  },

  /**
   * Generate an invite link (admin only)
   */
  async generateInviteLink(data: InviteLinkRequest): Promise<InviteLinkResponse> {
    const formData = new FormData();
    // Only append email if it's provided and not empty
    if (data.email && data.email.trim()) {
      formData.append('email', data.email);
    }
    formData.append('role', data.role);
    if (data.teamId) {
      formData.append('teamId', data.teamId.toString());
    }
    if (data.expiryHours) {
      formData.append('expiryHours', data.expiryHours.toString());
    }
    if (data.sendEmail !== undefined) {
      formData.append('sendEmail', data.sendEmail.toString());
    }

    const response = await apiClient.post<InviteLinkResponse>(
      '/api/v1/invite/generate',
      formData,
      suppressErrorToastConfig()
    );

    return response.data;
  },

  /**
   * Get list of active invite links (admin only)
   */
  async getInviteLinks(): Promise<InviteToken[]> {
    const response = await apiClient.get<{ invites: InviteToken[] }>('/api/v1/invite/list');
    return response.data.invites;
  },

  /**
   * Revoke an invite link (admin only)
   */
  async revokeInviteLink(inviteId: number): Promise<void> {
    await apiClient.delete(`/api/v1/invite/revoke/${inviteId}`, suppressErrorToastConfig());
  },

  /**
   * Clean up expired invite links (admin only)
   */
  async cleanupExpiredInvites(): Promise<{ deletedCount: number }> {
    const response = await apiClient.post<{ deletedCount: number }>('/api/v1/invite/cleanup');
    return response.data;
  },
};
type SuppressibleRequestConfig = AxiosRequestConfig & { suppressErrorToast?: boolean };
const suppressErrorToastConfig = (): SuppressibleRequestConfig => ({ suppressErrorToast: true });
