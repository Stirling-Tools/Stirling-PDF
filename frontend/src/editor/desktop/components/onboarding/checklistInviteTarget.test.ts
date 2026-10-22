import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChecklistInviteTarget } from "@app/components/onboarding/checklistInviteTarget";

interface UserCount {
  totalUsers: number | null;
  userCountSource: "admin" | "estimate" | "unknown";
  userCountError: string | null;
}

const { userCount } = vi.hoisted(() => ({
  userCount: vi.fn<() => UserCount>(),
}));

vi.mock("@cloud/components/onboarding/checklistInviteTarget", () => ({
  useChecklistInviteTarget: () => ({ loading: false, target: null }),
}));
vi.mock("@app/hooks/useSelfHostedAuth", () => ({
  useSelfHostedAuth: () => ({ isSelfHosted: true, isAuthenticated: true }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { enableLogin: true, isAdmin: true } }),
}));
vi.mock("@app/hooks/useServerExperience", () => ({
  useServerExperience: userCount,
}));

const target = () =>
  renderHook(() => useChecklistInviteTarget()).result.current;

describe("useChecklistInviteTarget (self-hosted)", () => {
  beforeEach(() => {
    userCount.mockReturnValue({
      totalUsers: 1,
      userCountSource: "admin",
      userCountError: null,
    });
  });

  it("points the server's only admin at People", () => {
    expect(target()).toEqual({ loading: false, target: "people" });
  });

  it("is loading before the user count arrives", () => {
    userCount.mockReturnValue({
      totalUsers: null,
      userCountSource: "unknown",
      userCountError: null,
    });
    expect(target().loading).toBe(true);
  });

  it("drops the target once the server has other users", () => {
    userCount.mockReturnValue({
      totalUsers: 4,
      userCountSource: "admin",
      userCountError: null,
    });
    expect(target()).toEqual({ loading: false, target: null });
  });

  it("settles on a failed count and keeps the row", () => {
    userCount.mockReturnValue({
      totalUsers: null,
      userCountSource: "unknown",
      userCountError: "network",
    });
    expect(target()).toEqual({ loading: false, target: "people" });
  });
});
