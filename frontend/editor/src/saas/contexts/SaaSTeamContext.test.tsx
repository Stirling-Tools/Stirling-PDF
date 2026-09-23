import { it, expect, vi } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SaaSTeamProvider, useSaaSTeam } from "@app/contexts/SaaSTeamContext";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@app/services/apiClient", () => ({ default: { get } }));
vi.mock("@app/auth/teamSession", () => ({
  useTeamAuth: () => ({
    canUseTeams: true,
    refreshAfterMembershipChange: vi.fn(),
  }),
}));

it("uses the server's current team and never guesses a parked team when that marker is missing", async () => {
  const parked = {
    teamId: 1,
    name: "Parked home",
    current: false,
    isPersonal: false,
    isLeader: true,
  };
  const active = {
    teamId: 2,
    name: "Organisation",
    current: true,
    isPersonal: false,
    isLeader: false,
  };
  let teams = [parked, active];
  get.mockImplementation(async (url: string) => ({
    data: url === "/api/v1/team/my" ? teams : [],
  }));
  const { result } = renderHook(() => useSaaSTeam(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SaaSTeamProvider>{children}</SaaSTeamProvider>
    ),
  });
  await waitFor(() => expect(result.current.currentTeam?.teamId).toBe(2));
  expectConsole.error(/Failed to fetch teams.*Network unavailable/s);
  get.mockRejectedValueOnce(new Error("Network unavailable"));
  await act(() => result.current.refreshTeams());
  expect(result.current.currentTeam?.teamId).toBe(2);
  expect(result.current.teams).toEqual([parked, active]);
  expect(result.current.loading).toBe(false);
  teams = [parked];
  await act(() => result.current.refreshTeams());
  expect(result.current.currentTeam).toBeNull();
  expect(result.current.loading).toBe(false);
  expect(result.current.isTeamLeader).toBe(false);
  expect(get).not.toHaveBeenCalledWith(
    "/api/v1/team/1/members",
    expect.anything(),
  );
  expect(get).not.toHaveBeenCalledWith(
    "/api/v1/team/1/invitations",
    expect.anything(),
  );
});
