import { useState, useEffect, useCallback } from 'react';
import apiClient from '@app/services/apiClient';
import { connectionModeService } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';

/**
 * Simplified team data for plan display
 */
interface TeamData {
  teamId: number;
  name: string;
  isPersonal: boolean;
  isLeader: boolean;
  seatsUsed: number;
}

/**
 * Return type for useDesktopTeam hook
 */
export interface UseDesktopTeamReturn {
  currentTeam: TeamData | null;
  isTeamLeader: boolean;
  isPersonalTeam: boolean;
  isManagedTeamMember: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for fetching basic team data in desktop SaaS mode
 * Only fetches when connected to SaaS backend
 */
export function useDesktopTeam(): UseDesktopTeamReturn {
  const [currentTeam, setCurrentTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeamData = useCallback(async () => {
    console.log('[useDesktopTeam] Fetching team data...');
    setLoading(true);
    setError(null);

    try {
      // Check if in SaaS mode and authenticated
      const mode = await connectionModeService.getCurrentMode();
      const isAuthenticated = await authService.isAuthenticated();

      if (mode !== 'saas' || !isAuthenticated) {
        console.log('[useDesktopTeam] Not in SaaS mode or not authenticated');
        setCurrentTeam(null);
        setLoading(false);
        return;
      }

      // Fetch user's teams from SaaS backend
      console.log('[useDesktopTeam] Calling /api/v1/team/my...');
      const response = await apiClient.get<TeamData[]>('/api/v1/team/my');
      console.log('[useDesktopTeam] Response status:', response.status);
      console.log('[useDesktopTeam] Response data:', JSON.stringify(response.data, null, 2));

      const activeTeam = response.data[0] || null;
      setCurrentTeam(activeTeam);
      console.log('[useDesktopTeam] Active team set:', JSON.stringify(activeTeam, null, 2));
    } catch (err) {
      console.error('[useDesktopTeam] Failed to fetch team data:', err);
      // Don't set error - team data is optional, just log it
      setCurrentTeam(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  // Subscribe to connection mode changes (refetch when switching to/from SaaS)
  useEffect(() => {
    const unsubscribe = connectionModeService.subscribeToModeChanges(() => {
      console.log('[useDesktopTeam] Connection mode changed, refetching team data');
      fetchTeamData();
    });

    return unsubscribe;
  }, [fetchTeamData]);

  const isTeamLeader = currentTeam?.isLeader ?? false;
  const isPersonalTeam = currentTeam?.isPersonal ?? true;
  const isManagedTeamMember = currentTeam && !isPersonalTeam && !isTeamLeader;

  return {
    currentTeam,
    isTeamLeader,
    isPersonalTeam,
    isManagedTeamMember,
    loading,
    error,
  };
}
