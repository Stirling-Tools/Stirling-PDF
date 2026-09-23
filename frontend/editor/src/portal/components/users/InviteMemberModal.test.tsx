import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";

// Deterministic i18n: render the English fallback so assertions read naturally.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock("@portal/contexts/TierContext", () => ({
  useTier: () => ({ tier: "pro" }),
}));

// The modal only calls these on submit; stub so imports resolve and no fetch fires.
vi.mock("@portal/api/users", () => ({
  createMember: vi.fn(),
  fetchUsers: vi.fn().mockResolvedValue({ members: [] }),
  ROLE_LABEL: { member: "Member", admin: "Admin" },
}));
// The email invite now routes through the usersBackend seam.
vi.mock("@app/portal/usersBackend", () => ({
  usersBackend: { inviteMember: vi.fn() },
}));
vi.mock("@portal/api/access", () => ({ createGrant: vi.fn() }));

import { InviteMemberModal } from "@portal/components/users/InviteMemberModal";
import { createMember } from "@portal/api/users";
import type { Team } from "@portal/api/teams";

const TEAMS: Team[] = [{ id: 1, name: "Default", userCount: 1, owners: [] }];

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

function renderModal(props: Partial<ComponentProps<typeof InviteMemberModal>>) {
  return render(
    <MantineProvider>
      <InviteMemberModal open onClose={() => {}} teams={TEAMS} {...props} />
    </MantineProvider>,
  );
}

describe("InviteMemberModal — add-user method gating", () => {
  it("SaaS (email only): no method toggle, opens to the email field", () => {
    renderModal({ canDirectCreate: false, canEmailInvite: true });
    expect(screen.queryByText("How to add them")).not.toBeInTheDocument();
    expect(screen.getByText("Email address")).toBeInTheDocument();
    expect(screen.queryByText("Username")).not.toBeInTheDocument();
  });

  it("self-hosted with mail: offers the toggle and defaults to create-account", () => {
    renderModal({ canDirectCreate: true, canEmailInvite: true });
    expect(screen.getByText("How to add them")).toBeInTheDocument();
    // Default mode is create-account (username field, not email).
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.queryByText("Email address")).not.toBeInTheDocument();
  });

  it("self-hosted without SMTP: no email option at all, create-account only", () => {
    renderModal({ canDirectCreate: true, canEmailInvite: false });
    expect(screen.queryByText("How to add them")).not.toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.queryByText("Email address")).not.toBeInTheDocument();
  });

  it("clamps initialMode=email to create-account when email is unavailable", () => {
    renderModal({
      canDirectCreate: true,
      canEmailInvite: false,
      initialMode: "email",
    });
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.queryByText("Email address")).not.toBeInTheDocument();
  });
});

describe("InviteMemberModal — direct account creation", () => {
  it("shows a short-password error on the password field", async () => {
    const user = userEvent.setup();
    renderModal({ canDirectCreate: true, canEmailInvite: false });

    await user.type(await screen.findByLabelText(/Username/), "ConnorYoh");
    await user.type(await screen.findByLabelText(/Password/), "12345");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      screen.getByText("Password must be at least 6 characters"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText(/Username/)).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("submits a six-character password with the selected account defaults", async () => {
    const user = userEvent.setup();
    vi.mocked(createMember).mockResolvedValue("ConnorYoh");
    renderModal({ canDirectCreate: true, canEmailInvite: false });

    await user.type(await screen.findByLabelText(/Username/), "ConnorYoh");
    await user.type(await screen.findByLabelText(/Password/), "123456");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(createMember).toHaveBeenCalledWith({
        username: "ConnorYoh",
        password: "123456",
        role: "member",
        teamId: 1,
        authType: "WEB",
        forceChange: true,
        forceMFA: false,
      }),
    );
  });

  it("rejects usernames that the backend username pattern rejects", async () => {
    const user = userEvent.setup();
    renderModal({ canDirectCreate: true, canEmailInvite: false });

    await user.type(await screen.findByLabelText(/Username/), "a--b");
    await user.type(await screen.findByLabelText(/Password/), "123456");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      screen.getByText(
        "Enter a valid username (3-50 characters) or email address",
      ),
    ).toBeInTheDocument();
    expect(createMember).not.toHaveBeenCalled();
  });

  it("does not carry direct-create validation into email mode", async () => {
    const user = userEvent.setup();
    renderModal({ canDirectCreate: true, canEmailInvite: true });

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.click(screen.getByLabelText("How to add them"));
    await user.click(screen.getByText("Invite by email"));

    expect(await screen.findByLabelText(/Email address/)).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.queryByText("Enter a valid email address"),
    ).not.toBeInTheDocument();
  });

  it("hides and clears password-account controls for an SSO account", async () => {
    const user = userEvent.setup();
    vi.mocked(createMember).mockResolvedValue("ConnorYoh");
    renderModal({
      canDirectCreate: true,
      canEmailInvite: false,
      hasOauth: true,
    });

    await user.click(screen.getByLabelText("Require MFA setup on first login"));
    await user.click(screen.getByLabelText("Sign-in method"));
    await user.click(screen.getByText("OAuth2 / SSO"));

    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Require a password change on first login"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Require MFA setup on first login"),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Username/), "ConnorYoh");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(createMember).toHaveBeenCalledWith({
        username: "ConnorYoh",
        password: undefined,
        role: "member",
        teamId: 1,
        authType: "OAUTH2",
        forceChange: false,
        forceMFA: false,
      }),
    );
  });
});
