import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import type { Team } from "@portal/api/teams";
import { usersBackend } from "@app/portal/usersBackend";

const TEAMS: Team[] = [{ id: 1, name: "Default", userCount: 1, owners: [] }];

it("preserves delivery and partial-failure warnings when Processor access is deferred", async () => {
  const onNotice = vi.fn();
  const onClose = vi.fn();
  vi.mocked(usersBackend.inviteMember).mockResolvedValueOnce({
    successCount: 1,
    warning: "The invite email could not be delivered.",
    errors: "Another address could not be invited.",
  });
  renderModal({
    canDirectCreate: false,
    canEmailInvite: true,
    manageGrants: true,
    onNotice,
    onClose,
  });
  fireEvent.change(screen.getByPlaceholderText("name@company.com"), {
    target: { value: "priya@acme.com" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /^Processor/ }));
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(onNotice).toHaveBeenCalledOnce();
  expect(onNotice).toHaveBeenCalledWith(
    expect.stringContaining("The invite email could not be delivered."),
  );
  expect(onNotice).toHaveBeenCalledWith(
    expect.stringContaining("Another address could not be invited."),
  );
  expect(onNotice).toHaveBeenCalledWith(
    expect.stringContaining("Processor access couldn't be granted yet"),
  );
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
