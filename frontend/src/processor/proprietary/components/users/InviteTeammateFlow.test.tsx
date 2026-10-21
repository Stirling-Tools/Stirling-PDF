import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { InviteTeammateForm } from "@portal/components/users/InviteTeammateFlow";
import { createMember } from "@portal/api/users";
import { usersBackend } from "@app/portal/usersBackend";

const state = vi.hoisted(() => ({
  admin: true,
  teamLead: false,
  email: false,
  direct: true,
  saas: false,
  loading: false,
  error: false,
  full: false,
  refresh: vi.fn(),
}));
vi.mock("@portal/components/settings/PortalRosterHost", () => ({
  PortalRosterHost: () => null,
}));
vi.mock("@portal/contexts/TierContext", () => ({
  useTier: () => ({ tier: "free" }),
}));
vi.mock("@app/portal/usersCapabilities", () => ({
  usersCapabilities: {
    get listingRequiresAdmin() {
      return !state.saas;
    },
    get directCreate() {
      return !state.saas;
    },
    get adminRole() {
      return !state.saas;
    },
    emailInvite: true,
  },
}));
vi.mock("@portal/views/usersData", () => ({
  useUsersData: () => ({
    usersState: {
      loading: state.loading,
      error: state.error ? new Error("offline") : null,
      data: {
        members: [
          {
            id: "1",
            isSelf: true,
            role: state.admin ? "admin" : "member",
            teamLead: state.teamLead,
            teamId: 7,
          },
        ],
        emailInvitesEnabled: state.email,
        summary: { seatsUsed: 1, seatLimit: state.full ? 1 : null },
      },
    },
    teamsState: {
      loading: false,
      error: null,
      data: [{ id: 7, name: "Legal", userCount: 1, owners: [] }],
    },
    authState: {
      loading: false,
      error: null,
      data: { canDirectCreate: state.direct, hasOauth: false, hasSaml: false },
    },
    refresh: state.refresh,
  }),
}));
vi.mock("@portal/api/users", () => ({
  createMember: vi.fn().mockResolvedValue("alex"),
  fetchUsers: vi.fn(),
  ROLE_LABEL: { member: "Member", admin: "Admin" },
}));
vi.mock("@app/portal/usersBackend", () => ({
  usersBackend: { inviteMember: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@portal/api/access", () => ({ createGrant: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    admin: true,
    teamLead: false,
    email: false,
    direct: true,
    saas: false,
    loading: false,
    error: false,
    full: false,
  });
});
function show(initialValue = "alex") {
  const onInvited = vi.fn();
  const onClose = vi.fn();
  render(
    <MantineProvider env="test">
      <InviteTeammateForm
        initialValue={initialValue}
        onInvited={onInvited}
        onClose={onClose}
      />
    </MantineProvider>,
  );
  return { onInvited, onClose };
}

it("creates a self-hosted account in the current team and refreshes the signing picker", async () => {
  const { onInvited, onClose } = show();
  expect(screen.getByRole("textbox", { name: /Username/ })).toHaveValue("alex");
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: "test-only-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() =>
    expect(createMember).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alex", teamId: 7, role: "member" }),
    ),
  );
  expect(onInvited).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
  expect(state.refresh).toHaveBeenCalledOnce();
  expect(usersBackend.inviteMember).not.toHaveBeenCalled();
});

it("uses SaaS team invitations even when self-hosted mail is disabled", async () => {
  Object.assign(state, {
    saas: true,
    admin: false,
    teamLead: true,
    direct: false,
  });
  const { onInvited } = show("alex+sign@example.com");
  expect(screen.getByRole("textbox", { name: /Email address/ })).toHaveValue(
    "alex+sign@example.com",
  );
  expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
  await waitFor(() =>
    expect(usersBackend.inviteMember).toHaveBeenCalledWith(
      "alex+sign@example.com",
      "member",
      7,
    ),
  );
  expect(createMember).not.toHaveBeenCalled();
  expect(onInvited).toHaveBeenCalledOnce();
});

it.each(["loading", "error", "full", "member", "disabled"])(
  "prevents invitation when %s",
  (condition) => {
    if (condition === "member") state.admin = false;
    else if (condition === "disabled") state.direct = false;
    else if (condition === "loading") state.loading = true;
    else if (condition === "error") state.error = true;
    else state.full = true;
    const { onClose } = show();
    expect(
      screen.queryByRole("button", { name: /Create account|Send invite/ }),
    ).not.toBeInTheDocument();
    expect(createMember).not.toHaveBeenCalled();
    expect(usersBackend.inviteMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(onClose).toHaveBeenCalledOnce();
  },
);
