import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

const h = vi.hoisted(() => ({
  alert: vi.fn(),
  generateInviteLink: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, opts?: Record<string, unknown>) => {
      const base = typeof fallback === "string" ? fallback : key;
      return opts
        ? base.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? ""))
        : base;
    },
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@app/components/toast", () => ({ alert: h.alert }));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { enableEmailInvites: true } }),
}));
vi.mock("@app/services/teamService", () => ({
  teamService: { getTeams: () => Promise.resolve([]) },
}));
vi.mock("@app/services/userManagementService", () => ({
  userManagementService: {
    generateInviteLink: h.generateInviteLink,
    getUsers: () =>
      Promise.resolve({
        maxAllowedUsers: 10,
        availableSlots: 5,
        grandfatheredUserCount: 0,
        licenseMaxUsers: 10,
        premiumEnabled: true,
        totalUsers: 5,
      }),
  },
}));

import InviteMembersModal from "@app/components/shared/InviteMembersModal";

async function generateLinkWithEmail() {
  render(
    <MantineProvider>
      <InviteMembersModal opened onClose={vi.fn()} />
    </MantineProvider>,
  );
  await act(async () => {});
  fireEvent.click(screen.getByText("Link"));
  fireEvent.change(screen.getByLabelText("Email (optional)"), {
    target: { value: "new@ex.com" },
  });
  fireEvent.click(screen.getByLabelText("Send invite link via email"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Generate Link" }));
  });
}

describe("InviteMembersModal — invite link delivery reporting", () => {
  beforeEach(() => {
    h.alert.mockClear();
    h.generateInviteLink.mockReset();
  });

  it("reports a failed send instead of claiming the link was emailed", async () => {
    h.generateInviteLink.mockResolvedValue({
      token: "t",
      inviteUrl: "https://example.test/invite/t",
      email: "new@ex.com",
      expiresAt: "2026-01-01T00:00:00",
      expiryHours: 72,
      emailSent: false,
      emailError: "connection refused",
    });

    await generateLinkWithEmail();

    await waitFor(() => expect(h.alert).toHaveBeenCalled());
    const [call] = h.alert.mock.calls[0];
    expect(call.alertType).toBe("error");
    expect(call.body).toContain("connection refused");
  });

  it("confirms the send only when the server says the mail left", async () => {
    h.generateInviteLink.mockResolvedValue({
      token: "t",
      inviteUrl: "https://example.test/invite/t",
      email: "new@ex.com",
      expiresAt: "2026-01-01T00:00:00",
      expiryHours: 72,
      emailSent: true,
    });

    await generateLinkWithEmail();

    await waitFor(() => expect(h.alert).toHaveBeenCalled());
    expect(h.alert.mock.calls[0][0].alertType).toBe("success");
  });
});
