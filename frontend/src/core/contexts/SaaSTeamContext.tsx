import { createContext, ReactNode } from 'react';

/**
 * Core stub for SaaS Team Context
 * Desktop layer provides the real implementation
 */

export interface TeamMember {
  id: string;
  username: string;
  email: string;
  role: string;
  joinedAt: number;
}

export interface TeamInvitation {
  id: string;
  email: string;
  invitedAt: number;
  invitedBy: string;
}

export interface Team {
  id: string;
  name: string;
  isPersonal: boolean;
  createdAt: number;
}

export interface SaaSTeamContextValue {
  currentTeam: Team | null;
  teams: Team[];
  teamMembers: TeamMember[];
  teamInvitations: TeamInvitation[];
  receivedInvitations: TeamInvitation[];
  isTeamLeader: boolean;
  isPersonalTeam: boolean;
  loading: boolean;
  inviteUser: (teamId: string, email: string) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  rejectInvitation: (invitationId: string) => Promise<void>;
  cancelInvitation: (invitationId: string) => Promise<void>;
  removeMember: (teamId: string, memberId: string) => Promise<void>;
  leaveTeam: (teamId: string) => Promise<void>;
  refreshTeams: () => Promise<void>;
}

const SaaSTeamContext = createContext<SaaSTeamContextValue | undefined>(undefined);

export function SaaSTeamProvider({ children }: { children: ReactNode }) {
  // Core stub - no-op implementation
  return children;
}

export function useSaaSTeam(): SaaSTeamContextValue {
  // Core stub - return default values
  return {
    currentTeam: null,
    teams: [],
    teamMembers: [],
    teamInvitations: [],
    receivedInvitations: [],
    isTeamLeader: false,
    isPersonalTeam: true,
    loading: false,
    inviteUser: async () => {},
    acceptInvitation: async () => {},
    rejectInvitation: async () => {},
    cancelInvitation: async () => {},
    removeMember: async () => {},
    leaveTeam: async () => {},
    refreshTeams: async () => {},
  };
}

export { SaaSTeamContext };
