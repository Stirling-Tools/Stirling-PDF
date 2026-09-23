import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import TeamSection from "@app/components/shared/config/configSections/TeamSection";

const { post, refreshTeams, refreshSession } = vi.hoisted(() => ({
  post: vi.fn(),
  refreshTeams: vi.fn().mockResolvedValue(undefined),
  refreshSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/services/apiClient", () => ({ default: { post } }));
vi.mock("@app/auth/teamSession", () => ({
  useTeamAuth: () => ({ refreshAfterMembershipChange: refreshSession }),
}));
vi.mock("@app/contexts/SaaSTeamContext", () => ({
  useSaaSTeam: () => ({
    currentTeam: { teamId: 9, name: "Acme", seatsUsed: 2 },
    teamMembers: [
      { id: 1, username: "Alex", email: "alex@example.com", role: "LEADER" },
      { id: 2, username: "Jamie", email: "jamie@example.com", role: "MEMBER" },
    ],
    teamInvitations: [],
    isTeamLeader: true,
    isPersonalTeam: false,
    refreshTeams,
  }),
}));
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  const { createInstance } = await import("i18next");
  const i18n = createInstance();
  await i18n.use(actual.initReactI18next).init({
    lng: "en",
    resources: {},
    interpolation: { escapeValue: false },
  });
  return { ...actual, useTranslation: () => ({ t: i18n.t, i18n }) };
});

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({
    data: {
      teamId: 9,
      teamName: "Acme",
      leaderUserId: 1,
      targetUserId: 2,
      linkedInstances: 0,
      subscribed: true,
      state: "READY",
    },
  });
});

it("keeps the SaaS team settings receipt open until the owner acknowledges it", async () => {
  const view = render(
    <MantineProvider>
      <TeamSection />
    </MantineProvider>,
  );
  refreshSession.mockImplementationOnce(async () => view.unmount());
  fireEvent.click(screen.getByRole("button", { name: "Member actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Make owner" }));
  fireEvent.click(await screen.findByRole("checkbox"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
  });
  expect(post).toHaveBeenCalledWith("/api/v1/team/9/ownership/transfer", {
    email: "jamie@example.com",
    expectedLeaderId: 1,
  });
  expect(screen.getByText("Ownership transferred")).toBeVisible();
  expect(refreshSession).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
  });
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).toBeNull();
});
