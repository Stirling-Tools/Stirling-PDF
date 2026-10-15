import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemberOverPlanLimitBootstrap from "@app/components/MemberOverPlanLimitBootstrap";
import { reportMemberOverPlanLimit } from "@app/services/memberOverPlanLimit";

const signOut = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => ({ signOut }) }));
vi.mock("@app/services/apiClient", () => ({ default: { post } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/{{(.*?)}}/g, (_, key: string) =>
        String(values?.[key] ?? ""),
      ),
  }),
}));

function refuse() {
  act(() => {
    reportMemberOverPlanLimit(403, {
      error: "MEMBER_OVER_PLAN_LIMIT",
      teamId: 42,
      teamName: "Acme",
      leaders: ["alex@acme.example"],
    });
  });
}

describe("member over plan limit screen", () => {
  beforeEach(() => {
    signOut.mockReset();
    post.mockReset();
  });

  it("stays hidden until the backend refuses the member", () => {
    render(
      <MantineProvider>
        <MemberOverPlanLimitBootstrap />
      </MantineProvider>,
    );
    expect(
      screen.queryByText("Your account is disabled"),
    ).not.toBeInTheDocument();
    refuse();
    expect(screen.getByText("Your account is disabled")).toBeInTheDocument();
    expect(
      screen.getByText(/Acme's plan doesn't cover your account right now/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "alex@acme.example" }),
    ).toHaveAttribute("href", "mailto:alex@acme.example");
  });

  it("leaving the team is the way out", async () => {
    post.mockResolvedValue({});
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(
      <MantineProvider>
        <MemberOverPlanLimitBootstrap />
      </MantineProvider>,
    );
    refuse();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave team" }));
    });
    expect(post).toHaveBeenCalledWith("/api/v1/team/42/leave");
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("says so when leaving fails, and can still sign out", async () => {
    post.mockRejectedValue(new Error("down"));
    render(
      <MantineProvider>
        <MemberOverPlanLimitBootstrap />
      </MantineProvider>,
    );
    refuse();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave team" }));
    });
    expect(
      screen.getByText("Couldn't leave the team. Please try again."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
