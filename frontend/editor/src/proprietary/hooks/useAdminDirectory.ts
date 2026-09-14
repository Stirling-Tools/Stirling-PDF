import { useCallback } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alert } from "@app/components/toast";
import { qk } from "@app/query/keys";
import {
  userManagementService,
  type AdminSettingsData,
} from "@app/services/userManagementService";
import {
  teamService,
  type Team,
  type TeamDetailsUIResponse,
} from "@app/services/teamService";

/**
 * The people and teams an admin screen reads and writes. Three sections read
 * overlapping slices of it, so they share these keys rather than each holding
 * a copy, and each write says which slices it invalidates.
 *
 * `enabled` is the login-enabled gate: with login off the endpoints are not
 * callable and the sections render example data instead.
 */
export function useAdminUsers(enabled: boolean) {
  return useQuery<AdminSettingsData>({
    queryKey: qk.adminUsers(),
    queryFn: () => userManagementService.getUsers(),
    enabled,
  });
}

export function useTeams(enabled: boolean) {
  return useQuery<Team[]>({
    queryKey: qk.teams(),
    queryFn: () => teamService.getTeams(),
    enabled,
  });
}

export function useTeamDetails(teamId: number, enabled: boolean) {
  return useQuery<TeamDetailsUIResponse>({
    queryKey: qk.teamDetails(teamId),
    queryFn: () => teamService.getTeamDetails(teamId),
    enabled,
  });
}

/**
 * Imperative read, for flows that fetch before opening a modal. Serves the
 * same cache entry the sections render from, so an already-loaded directory
 * costs nothing.
 */
export function useFetchAdminUsers() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      queryClient.fetchQuery<AdminSettingsData>({
        queryKey: qk.adminUsers(),
        queryFn: () => userManagementService.getUsers(),
      }),
    [queryClient],
  );
}

/** Which slices of the directory a write disturbs. */
export type DirectoryScope = "users" | "teams" | "teamDetails";

const SCOPE_KEYS: Record<DirectoryScope, readonly unknown[]> = {
  users: qk.adminUsers(),
  teams: qk.teams(),
  // Prefix, not one id: a membership move changes two teams' detail rows.
  teamDetails: ["editor", "teamDetails"],
};

/**
 * Blanket invalidation, for child components that write through their own
 * services (invites, password changes, seat updates). The scopes those touch
 * are not visible from here, so they refresh everything.
 */
export function useInvalidateAdminDirectory() {
  const invalidate = useInvalidateScopes();
  return useCallback(
    () => invalidate(["users", "teams", "teamDetails"]),
    [invalidate],
  );
}

function useInvalidateScopes() {
  const queryClient = useQueryClient();
  return useCallback(
    (scopes: readonly DirectoryScope[]) => {
      for (const scope of scopes) {
        queryClient.invalidateQueries({ queryKey: SCOPE_KEYS[scope] });
      }
    },
    [queryClient],
  );
}

/** The server's message if it sent one, since it explains the refusal. */
export function adminErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    return (
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      fallback
    );
  }
  return (error instanceof Error ? error.message : undefined) || fallback;
}

interface AdminMutationOptions<TArgs> {
  write: (args: TArgs) => Promise<unknown>;
  invalidates: readonly DirectoryScope[];
  success: string;
  errorFallback: string;
  /** Local state to clear once the write lands, such as closing its modal. */
  onDone?: () => void;
}

/**
 * One directory write: toasts the outcome, refreshes the slices it changed,
 * and exposes `isPending` for the button that triggered it. All thirteen
 * call sites did this by hand, and one of them forgot the refresh.
 */
export function useAdminMutation<TArgs = void>({
  write,
  invalidates,
  success,
  errorFallback,
  onDone,
}: AdminMutationOptions<TArgs>) {
  const invalidate = useInvalidateScopes();
  return useMutation({
    mutationFn: write,
    onSuccess: () => {
      alert({ alertType: "success", title: success });
      invalidate(invalidates);
      onDone?.();
    },
    onError: (error) => {
      // The toast carries the server's wording; the console keeps the cause.
      console.error("Admin directory write failed:", error);
      alert({
        alertType: "error",
        title: adminErrorMessage(error, errorFallback),
      });
    },
  });
}
