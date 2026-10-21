import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChecklistInviteTarget } from "@app/components/onboarding/checklistInviteTarget";

const { team } = vi.hoisted(() => ({
  team: vi.fn<
    () => {
      isTeamLeader: boolean;
      loading: boolean;
      currentTeam: { memberCount: number } | null;
    }
  >(),
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ isAnonymous: false }),
}));
vi.mock("@app/contexts/SaaSTeamContext", () => ({ useSaaSTeam: team }));

describe("useChecklistInviteTarget", () => {
  beforeEach(() => {
    team.mockReturnValue({
      isTeamLeader: true,
      loading: false,
      currentTeam: { memberCount: 1 },
    });
  });

  it("points a solo team leader at Users", () => {
    const { result } = renderHook(() => useChecklistInviteTarget());
    expect(result.current).toEqual({ loading: false, target: "users" });
  });

  it("drops the target once the team has other members", () => {
    team.mockReturnValue({
      isTeamLeader: true,
      loading: false,
      currentTeam: { memberCount: 3 },
    });
    const { result } = renderHook(() => useChecklistInviteTarget());
    expect(result.current.target).toBeNull();
  });

  it("is loading until the team first loads, and not on a refetch", () => {
    team.mockReturnValue({
      isTeamLeader: false,
      loading: true,
      currentTeam: null,
    });
    const { result, rerender } = renderHook(() => useChecklistInviteTarget());
    expect(result.current.loading).toBe(true);

    team.mockReturnValue({
      isTeamLeader: true,
      loading: false,
      currentTeam: { memberCount: 1 },
    });
    rerender();
    expect(result.current).toEqual({ loading: false, target: "users" });

    team.mockReturnValue({
      isTeamLeader: true,
      loading: true,
      currentTeam: { memberCount: 1 },
    });
    rerender();
    expect(result.current.loading).toBe(false);
  });
});
