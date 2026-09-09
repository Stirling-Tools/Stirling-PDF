import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import apiClient from "@app/services/apiClient";
import { useTeamAuth } from "@app/auth/teamSession";

/**
 * Shared (cloud) SaaS Team Context.
 *
 * Provides team management for authenticated (non-anonymous) users. The
 * platform-specific auth bits — whether teams may be used at all, and how to
 * refresh derived auth state after a membership change — come from the
 * {@code @app/auth/teamSession} seam (Supabase web session on saas, authService
 * on desktop), keeping this context free of any platform auth coupling.
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
  const [receivedInvitations, setReceivedInvitations] = useState<
    TeamInvitation[]
  >([]);
  const [loading, setLoading] = useState(true);

  const { canUseTeams, refreshAfterMembershipChange } = useTeamAuth();

  const fetchMyTeams = useCallback(async () => {
    if (!canUseTeams) return null;

    try {
      const response = await apiClient.get<Team[]>("/api/v1/team/my", {
        suppressErrorToast: true,
      });
      setTeams(response.data);

      const activeTeam = response.data[0];
      setCurrentTeam(activeTeam || null);
      return activeTeam || null;
    } catch (error) {
      console.error("[SaaSTeamContext] Failed to fetch teams:", error);
      return null;
    }
  }, [canUseTeams]);

  const fetchTeamMembers = useCallback(async (teamId: number) => {
    try {
      const response = await apiClient.get<TeamMember[]>(
        `/api/v1/team/${teamId}/members`,
        { suppressErrorToast: true },
      );
      setTeamMembers(response.data);
    } catch (error) {
      console.error("[SaaSTeamContext] Failed to fetch team members:", error);
    }
  }, []);

  const fetchTeamInvitations = useCallback(
    async (teamId?: number) => {
      if (!canUseTeams || !teamId) return;

      try {
        const response = await apiClient.get<TeamInvitation[]>(
          `/api/v1/team/${teamId}/invitations`,
          { suppressErrorToast: true },
        );
        setTeamInvitations(response.data);
      } catch (error) {
        console.error(
          "[SaaSTeamContext] Failed to fetch team invitations:",
          error,
        );
      }
    },
    [canUseTeams],
  );

  const fetchReceivedInvitations = useCallback(async () => {
    if (!canUseTeams) return;

    try {
      const response = await apiClient.get<TeamInvitation[]>(
        "/api/v1/team/invitations/pending",
        { suppressErrorToast: true },
      );
      setReceivedInvitations(response.data);
    } catch (error) {
      console.error(
        "[SaaSTeamContext] Failed to fetch received invitations:",
        error,
      );
    }
  }, [canUseTeams]);

  useEffect(() => {
    if (canUseTeams) {
      fetchMyTeams();
      fetchReceivedInvitations();
    } else {
      setTeams([]);
      setCurrentTeam(null);
      setTeamMembers([]);
      setTeamInvitations([]);
      setReceivedInvitations([]);
      setLoading(false);
    }
  }, [canUseTeams, fetchMyTeams, fetchReceivedInvitations]);

  useEffect(() => {
    if (currentTeam && !currentTeam.isPersonal) {
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
  }, [currentTeam, fetchTeamMembers, fetchTeamInvitations]);

  const inviteUser = async (email: string) => {
    if (!currentTeam) throw new Error("No current team");

    await apiClient.post("/api/v1/team/invite", {
      teamId: currentTeam.teamId,
      email,
    });
    await fetchTeamInvitations(currentTeam.teamId);
  };

  const refreshTeams = useCallback(async () => {
    const newCurrentTeam = await fetchMyTeams();
    await fetchReceivedInvitations();
    if (newCurrentTeam && !newCurrentTeam.isPersonal) {
      await fetchTeamMembers(newCurrentTeam.teamId);
      // Only fetch invitations if user is team leader
      if (newCurrentTeam.isLeader) {
        await fetchTeamInvitations(newCurrentTeam.teamId);
      }
    }
  }, [
    fetchMyTeams,
    fetchReceivedInvitations,
    fetchTeamMembers,
    fetchTeamInvitations,
  ]);

  const acceptInvitation = async (token: string) => {
    await apiClient.post(`/api/v1/team/invitations/${token}/accept`);
    await fetchReceivedInvitations();
    await refreshTeams();
    await refreshAfterMembershipChange();
  };

  const rejectInvitation = async (token: string) => {
    await apiClient.post(`/api/v1/team/invitations/${token}/reject`);
    await fetchReceivedInvitations();
  };

  const cancelInvitation = async (invitationId: number) => {
    await apiClient.delete(`/api/v1/team/invitations/${invitationId}`);
    if (currentTeam) {
      await fetchTeamInvitations(currentTeam.teamId);
    }
  };

  const removeMember = async (memberId: number) => {
    if (!currentTeam) throw new Error("No current team");

    await apiClient.delete(
      `/api/v1/team/${currentTeam.teamId}/members/${memberId}`,
    );
    await refreshTeams();
    await fetchTeamMembers(currentTeam.teamId);
    // No need to refresh session/credits: the team leader's status hasn't changed
  };

  const leaveTeam = async () => {
    if (!currentTeam) throw new Error("No current team");

    await apiClient.post(`/api/v1/team/${currentTeam.teamId}/leave`);
    await refreshTeams();
    await refreshAfterMembershipChange();
  };

  const isTeamLeader = currentTeam?.isLeader ?? false;
  const isPersonalTeam = currentTeam?.isPersonal ?? true;

  return (
    <SaaSTeamContext.Provider
      value={{
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
        refreshTeams,
      }}
    >
      {children}
    </SaaSTeamContext.Provider>
  );
}

export function useSaaSTeam() {
  const context = useContext(SaaSTeamContext);
  if (context === undefined) {
    throw new Error("useSaaSTeam must be used within a SaaSTeamProvider");
  }
  return context;
}

export { SaaSTeamContext };
export type { Team, TeamMember, TeamInvitation };
