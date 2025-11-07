import apiClient from '@app/services/apiClient';
import type { AxiosRequestConfig } from 'axios';

export interface Team {
  id: number;
  name: string;
  userCount?: number;
}

export interface TeamMember {
  id: number;
  username: string;
  email?: string;
  roleName: string;
  enabled: boolean;
  team?: {
    id: number;
    name: string;
  };
  lastRequest?: number | null;
  rolesAsString?: string;
  authenticationType?: string;
}

export interface TeamDetailsResponse {
  team: Team;
  members: TeamMember[];
  availableUsers: TeamMember[];
}

interface TeamDetailsData {
  team: Team;
  teamUsers: TeamMember[];
  availableUsers: TeamMember[];
  userLastRequest?: Record<string, number>;
}

const suppressErrorToastConfig: AxiosRequestConfig & { suppressErrorToast: boolean } = {
  suppressErrorToast: true,
};

/**
 * Team Management Service
 * Provides functions to interact with team-related backend APIs
 */
export const teamService = {
  /**
   * Get all teams with user counts
   */
  async getTeams(): Promise<Team[]> {
    const response = await apiClient.get<{ teamsWithCounts: Team[] }>('/api/v1/proprietary/ui-data/teams');
    return response.data.teamsWithCounts;
  },

  /**
   * Get team details including members
   */
  async getTeamDetails(teamId: number): Promise<TeamDetailsData> {
    const response = await apiClient.get(`/api/v1/proprietary/ui-data/teams/${teamId}`);
    return response.data;
  },

  /**
   * Create a new team
   */
  async createTeam(name: string): Promise<void> {
    const formData = new FormData();
    formData.append('name', name);
    await apiClient.post('/api/v1/team/create', formData, suppressErrorToastConfig);
  },

  /**
   * Rename an existing team
   */
  async renameTeam(teamId: number, newName: string): Promise<void> {
    const formData = new FormData();
    formData.append('teamId', teamId.toString());
    formData.append('newName', newName);
    await apiClient.post('/api/v1/team/rename', formData, suppressErrorToastConfig);
  },

  /**
   * Delete a team (only if it has no members)
   */
  async deleteTeam(teamId: number): Promise<void> {
    const formData = new FormData();
    formData.append('teamId', teamId.toString());
    await apiClient.post('/api/v1/team/delete', formData, suppressErrorToastConfig);
  },

  /**
   * Add a user to a team
   */
  async addUserToTeam(teamId: number, userId: number): Promise<void> {
    const formData = new FormData();
    formData.append('teamId', teamId.toString());
    formData.append('userId', userId.toString());
    await apiClient.post('/api/v1/team/addUser', formData, suppressErrorToastConfig);
  },

  /**
   * Move a user to a specific team (used when "removing" from a team - moves to Default)
   */
  async moveUserToTeam(username: string, currentRole: string, teamId: number): Promise<void> {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('role', currentRole);
    formData.append('teamId', teamId.toString());
    await apiClient.post('/api/v1/user/admin/changeRole', formData, suppressErrorToastConfig);
  },
};
