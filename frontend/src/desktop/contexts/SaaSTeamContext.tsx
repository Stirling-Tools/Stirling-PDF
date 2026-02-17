import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import apiClient from '@app/services/apiClient';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';

/**
 * Desktop implementation of SaaS Team Context
 * Provides team management for users connected to SaaS backend
 * CRITICAL: Only active when in SaaS mode - all API calls check connection mode first
 */

interface Team {
  teamId: number;
  name: string;
  teamType: string;
  isPersonal: boolean;
  memberCount: number;
  seatCount: number;
  seatsUsed: number;
  maxSeats: number;
  isLeader: boolean;
}

interface TeamMember {
  id: number;
  username: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface TeamInvitation {
  invitationId: number;
  teamName: string;
  inviterEmail: string;
  inviteeEmail: string;
  invitationToken: string;
  status: string;
  expiresAt: string;
}

interface SaaSTeamContextType {
  currentTeam: Team | null;
  teams: Team[];
  teamMembers: TeamMember[];
  teamInvitations: TeamInvitation[];
  receivedInvitations: TeamInvitation[];
  isTeamLeader: boolean;
  isPersonalTeam: boolean;
  loading: boolean;

  inviteUser: (email: string) => Promise<void>;
  acceptInvitation: (token: string) => Promise<void>;
  rejectInvitation: (token: string) => Promise<void>;
  cancelInvitation: (invitationId: number) => Promise<void>;
  removeMember: (memberId: number) => Promise<void>;
  leaveTeam: () => Promise<void>;
  refreshTeams: () => Promise<void>;
}

const SaaSTeamContext = createContext<SaaSTeamContextType>({
  currentTeam: null,
  teams: [],
  teamMembers: [],
  teamInvitations: [],
  receivedInvitations: [],
  isTeamLeader: false,
  isPersonalTeam: true,
  loading: true,
  inviteUser: async () => {},
  acceptInvitation: async () => {},
  rejectInvitation: async () => {},
  cancelInvitation: async () => {},
  removeMember: async () => {},
  leaveTeam: async () => {},
  refreshTeams: async () => {},
});

export function SaaSTeamProvider({ children }: { children: ReactNode }) {
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [receivedInvitations, setReceivedInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaasMode, setIsSaasMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if in SaaS mode and authenticated
  useEffect(() => {
    const checkAccess = async () => {
      const mode = await connectionModeService.getCurrentMode();
      const auth = await authService.isAuthenticated();
      setIsSaasMode(mode === 'saas');
      setIsAuthenticated(auth);
    };

    checkAccess();

    // Subscribe to connection mode changes
    const unsubscribe = connectionModeService.subscribeToModeChanges(checkAccess);
    return unsubscribe;
  }, []);

  // Subscribe to auth changes
  useEffect(() => {
    const unsubscribe = authService.subscribeToAuth((status) => {
      setIsAuthenticated(status === 'authenticated');
    });
    return unsubscribe;
  }, []);

  const fetchMyTeams = useCallback(async () => {
    // CRITICAL: Only fetch if in SaaS mode and authenticated
    if (!isSaasMode || !isAuthenticated) {
      console.log('[SaaSTeamContext] Skipping team fetch - not in SaaS mode or not authenticated');
      return null;
    }

    try {
      const response = await apiClient.get<Team[]>('/api/v1/team/my');
      setTeams(response.data);

      const activeTeam = response.data[0];
      setCurrentTeam(activeTeam || null);
      return activeTeam || null;
    } catch (error) {
      console.error('[SaaSTeamContext] Failed to fetch teams:', error);
      return null;
    }
  }, [isSaasMode, isAuthenticated]);

  const fetchTeamMembers = useCallback(async (teamId: number) => {
    // CRITICAL: Only fetch if in SaaS mode and authenticated
    if (!isSaasMode || !isAuthenticated) {
      console.log('[SaaSTeamContext] Skipping members fetch - not in SaaS mode or not authenticated');
      return;
    }

    try {
      const response = await apiClient.get<TeamMember[]>(`/api/v1/team/${teamId}/members`);
      setTeamMembers(response.data);
    } catch (error) {
      console.error('[SaaSTeamContext] Failed to fetch team members:', error);
    }
  }, [isSaasMode, isAuthenticated]);

  const fetchTeamInvitations = useCallback(async (teamId?: number) => {
    // CRITICAL: Only fetch if in SaaS mode and authenticated
    if (!isSaasMode || !isAuthenticated || !teamId) {
      return;
    }

    try {
      const response = await apiClient.get<TeamInvitation[]>(`/api/v1/team/${teamId}/invitations`);
      setTeamInvitations(response.data);
    } catch (error) {
      console.error('[SaaSTeamContext] Failed to fetch team invitations:', error);
    }
  }, [isSaasMode, isAuthenticated]);

  const fetchReceivedInvitations = useCallback(async () => {
    // CRITICAL: Only fetch if in SaaS mode and authenticated
    if (!isSaasMode || !isAuthenticated) {
      return;
    }

    console.log('[SaaSTeamContext] Fetching received team invitations');

    try {
      const response = await apiClient.get<TeamInvitation[]>('/api/v1/team/invitations/pending');
      console.log('[SaaSTeamContext] Received invitations response:', response.data);
      setReceivedInvitations(response.data);
    } catch (error) {
      console.error('[SaaSTeamContext] Failed to fetch received invitations:', error);
    }
  }, [isSaasMode, isAuthenticated]);

  useEffect(() => {
    if (isSaasMode && isAuthenticated) {
      fetchMyTeams();
      fetchReceivedInvitations();
    } else {
      // Clear state when not in SaaS mode or not authenticated
      setTeams([]);
      setCurrentTeam(null);
      setTeamMembers([]);
      setTeamInvitations([]);
      setReceivedInvitations([]);
      setLoading(false);
    }
  }, [isSaasMode, isAuthenticated, fetchMyTeams, fetchReceivedInvitations]);

  useEffect(() => {
    if (currentTeam && !currentTeam.isPersonal && isSaasMode && isAuthenticated) {
      fetchTeamMembers(currentTeam.teamId);
      // Only fetch invitations if user is team leader
      if (currentTeam.isLeader) {
        fetchTeamInvitations(currentTeam.teamId);
      } else {
        setTeamInvitations([]);
      }
    } else {
      setTeamMembers([]);
      setTeamInvitations([]);
    }
    setLoading(false);
  }, [currentTeam, isSaasMode, isAuthenticated, fetchTeamMembers, fetchTeamInvitations]);

  const inviteUser = async (email: string) => {
    if (!currentTeam) throw new Error('No current team');
    if (!isSaasMode) throw new Error('Not in SaaS mode');

    await apiClient.post('/api/v1/team/invite', {
      teamId: currentTeam.teamId,
      email
    });
    await fetchTeamInvitations(currentTeam.teamId);
  };

  const acceptInvitation = async (token: string) => {
    if (!isSaasMode) throw new Error('Not in SaaS mode');

    await apiClient.post(`/api/v1/team/invitations/${token}/accept`);
    await fetchReceivedInvitations();
    await refreshTeams();
    // Note: Desktop doesn't have refreshCredits/refreshSession like SaaS
  };

  const rejectInvitation = async (token: string) => {
    if (!isSaasMode) throw new Error('Not in SaaS mode');

    await apiClient.post(`/api/v1/team/invitations/${token}/reject`);
    await fetchReceivedInvitations();
  };

  const cancelInvitation = async (invitationId: number) => {
    if (!isSaasMode) throw new Error('Not in SaaS mode');

    await apiClient.delete(`/api/v1/team/invitations/${invitationId}`);
    if (currentTeam) {
      await fetchTeamInvitations(currentTeam.teamId);
    }
  };

  const removeMember = async (memberId: number) => {
    if (!currentTeam) throw new Error('No current team');
    if (!isSaasMode) throw new Error('Not in SaaS mode');

    await apiClient.delete(`/api/v1/team/${currentTeam.teamId}/members/${memberId}`);
    await refreshTeams();
    await fetchTeamMembers(currentTeam.teamId);
  };

  const leaveTeam = async () => {
    if (!currentTeam) throw new Error('No current team');
    if (!isSaasMode) throw new Error('Not in SaaS mode');

    await apiClient.post(`/api/v1/team/${currentTeam.teamId}/leave`);
    await refreshTeams();
    // Note: Desktop doesn't have refreshCredits/refreshSession like SaaS
  };

  const refreshTeams = useCallback(async () => {
    if (!isSaasMode || !isAuthenticated) {
      console.log('[SaaSTeamContext] Skipping refresh - not in SaaS mode or not authenticated');
      return;
    }

    const newCurrentTeam = await fetchMyTeams();
    await fetchReceivedInvitations();
    if (newCurrentTeam && !newCurrentTeam.isPersonal) {
      await fetchTeamMembers(newCurrentTeam.teamId);
      // Only fetch invitations if user is team leader
      if (newCurrentTeam.isLeader) {
        await fetchTeamInvitations(newCurrentTeam.teamId);
      }
    }
  }, [isSaasMode, isAuthenticated, fetchMyTeams, fetchReceivedInvitations, fetchTeamMembers, fetchTeamInvitations]);

  const isTeamLeader = currentTeam?.isLeader ?? false;
  const isPersonalTeam = currentTeam?.isPersonal ?? true;

  return (
    <SaaSTeamContext.Provider value={{
      currentTeam,
      teams,
      teamMembers,
      teamInvitations,
      receivedInvitations,
      isTeamLeader,
      isPersonalTeam,
      loading,
      inviteUser,
      acceptInvitation,
      rejectInvitation,
      cancelInvitation,
      removeMember,
      leaveTeam,
      refreshTeams
    }}>
      {children}
    </SaaSTeamContext.Provider>
  );
}

export function useSaaSTeam() {
  const context = useContext(SaaSTeamContext);
  if (context === undefined) {
    throw new Error('useSaaSTeam must be used within a SaaSTeamProvider');
  }
  return context;
}

export { SaaSTeamContext };
export type { Team, TeamMember, TeamInvitation };
