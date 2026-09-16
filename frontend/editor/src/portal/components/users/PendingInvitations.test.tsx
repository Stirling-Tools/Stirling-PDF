import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, opts?: Record<string, unknown>) => {
      const base = fallback ?? key;
      // Minimal interpolation so {{email}} / {{who}} assertions read naturally.
      return opts
        ? base.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? ""))
        : base;
    },
  }),
}));

import { PendingInvitations } from "@portal/components/users/PendingInvitations";
import type { PendingInvitation } from "@portal/api/users";

const INVITES: PendingInvitation[] = [
  { id: 101, email: "sam@acme.com", invitedBy: "leader@acme.com" },
  { id: 102, email: "dana@acme.com" },
];

function renderPanel(onCancel = vi.fn()) {
  render(
    <MantineProvider>
      <PendingInvitations invitations={INVITES} onCancel={onCancel} />
    </MantineProvider>,
  );
  return onCancel;
}

describe("PendingInvitations", () => {
  it("lists each pending invite with its email and inviter", () => {
    renderPanel();
    expect(screen.getByText("sam@acme.com")).toBeInTheDocument();
    expect(screen.getByText("dana@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Invited by leader@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Pending invitations")).toBeInTheDocument();
  });

  it("revoking an invite calls back with that invitation", () => {
    const onCancel = renderPanel();
    const buttons = screen.getAllByText("Revoke");
    fireEvent.click(buttons[0]);
    expect(onCancel).toHaveBeenCalledWith(INVITES[0]);
  });

  it("names a link with no bound address instead of showing a blank row", () => {
    const general: PendingInvitation[] = [{ id: 103, email: "" }];
    render(
      <MantineProvider>
        <PendingInvitations invitations={general} onCancel={vi.fn()} />
      </MantineProvider>,
    );
    expect(screen.getByText("Anyone with the link")).toBeInTheDocument();
  });
});
