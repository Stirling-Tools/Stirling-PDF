import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// Deterministic i18n: render the English fallback so assertions read naturally,
// interpolating {{...}} so message assertions match what a user would see.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, opts?: Record<string, unknown>) => {
      const base = fallback ?? key;
      return opts
        ? base.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? ""))
        : base;
    },
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
vi.mock("@portal/api/inviteLinks", () => ({ generateInviteLink: vi.fn() }));

import { InviteMemberModal } from "@portal/components/users/InviteMemberModal";
import { generateInviteLink } from "@portal/api/inviteLinks";
import { createGrant } from "@portal/api/access";
import type { Team } from "@portal/api/teams";

const TEAMS: Team[] = [{ id: 1, name: "Default", userCount: 1, owners: [] }];

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

  it("offers the link option only where the backend can issue one", () => {
    renderModal({
      canDirectCreate: true,
      canEmailInvite: true,
      canInviteLink: true,
      initialMode: "link",
    });
    expect(screen.getByText("How to add them")).toBeInTheDocument();
    expect(screen.getByText("Email address (optional)")).toBeInTheDocument();
    expect(screen.getByText("Expires in (hours)")).toBeInTheDocument();
  });

  it("hides link mode when invite links are turned off", () => {
    renderModal({
      canDirectCreate: true,
      canEmailInvite: true,
      canInviteLink: false,
      initialMode: "link",
    });
    // Falls back to the preferred mode rather than showing a dead option.
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.queryByText("Expires in (hours)")).not.toBeInTheDocument();
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

const LINK = {
  token: "tok-1",
  inviteUrl: "https://pdf.example.com/invite/tok-1",
  email: null,
  expiresAt: "2026-01-01T00:00:00Z",
  expiryHours: 72,
};

function renderLinkModal(
  props: Partial<ComponentProps<typeof InviteMemberModal>> = {},
) {
  return renderModal({
    canDirectCreate: true,
    canEmailInvite: true,
    canInviteLink: true,
    manageGrants: true,
    defaultTeamId: 1,
    initialMode: "link",
    ...props,
  });
}

const createLink = () =>
  fireEvent.click(screen.getByRole("button", { name: "Create link" }));

describe("InviteMemberModal — invite link creation", () => {
  beforeEach(() => {
    vi.mocked(generateInviteLink).mockReset().mockResolvedValue(LINK);
    vi.mocked(createGrant).mockReset();
  });

  it("mints the link from the form values and shows it for copying", async () => {
    renderLinkModal();
    createLink();

    await waitFor(() =>
      expect(generateInviteLink).toHaveBeenCalledWith({
        email: undefined,
        role: "ROLE_USER",
        teamId: 1,
        expiryHours: 72,
        sendEmail: false,
      }),
    );
    expect(await screen.findByDisplayValue(LINK.inviteUrl)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    // The form is replaced by the link, so there is nothing left to submit.
    expect(screen.queryByText("Expires in (hours)")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create link" }),
    ).not.toBeInTheDocument();
  });

  it("emails the link only when asked and the address is usable", async () => {
    renderLinkModal();
    fireEvent.change(screen.getByLabelText("Email address (optional)"), {
      target: { value: "sam@acme.com" },
    });
    fireEvent.click(screen.getByLabelText("Email the link to them"));
    createLink();

    await waitFor(() =>
      expect(generateInviteLink).toHaveBeenCalledWith(
        expect.objectContaining({ email: "sam@acme.com", sendEmail: true }),
      ),
    );
  });

  it("reports a link that could not be emailed beside the link itself", async () => {
    vi.mocked(generateInviteLink).mockResolvedValue({
      ...LINK,
      email: "sam@acme.com",
      emailSent: false,
      emailError: "SMTP refused the message",
    });
    const onNotice = vi.fn();
    renderLinkModal({ onNotice });
    fireEvent.change(screen.getByLabelText("Email address (optional)"), {
      target: { value: "sam@acme.com" },
    });
    fireEvent.click(screen.getByLabelText("Email the link to them"));
    createLink();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("SMTP refused the message");
    expect(screen.getByDisplayValue(LINK.inviteUrl)).toBeInTheDocument();
    // The modal stays open on the link, so the warning belongs to the modal.
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("marks the expiry field, not the email field, when the expiry is out of range", async () => {
    renderLinkModal();
    const expiry = screen.getByLabelText("Expires in (hours)");
    fireEvent.change(expiry, { target: { value: "0" } });
    createLink();

    await waitFor(() =>
      expect(
        screen.getByText("Expiry must be between 1 and 8760 hours"),
      ).toBeInTheDocument(),
    );
    expect(generateInviteLink).not.toHaveBeenCalled();
    expect(expiry).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByLabelText("Email address (optional)"),
    ).not.toHaveAttribute("aria-invalid");
    expect(expiry.getAttribute("aria-describedby")).toBe(
      screen.getByText("Expiry must be between 1 and 8760 hours").id,
    );
  });

  it("does not offer Processor on a link, which cannot carry a grant", async () => {
    renderLinkModal();
    expect(screen.queryByText("Processor")).not.toBeInTheDocument();
    createLink();
    await waitFor(() => expect(generateInviteLink).toHaveBeenCalled());
    expect(createGrant).not.toHaveBeenCalled();

    renderModal({ canEmailInvite: true, manageGrants: true });
    expect(screen.getByText("Processor")).toBeInTheDocument();
  });
});
