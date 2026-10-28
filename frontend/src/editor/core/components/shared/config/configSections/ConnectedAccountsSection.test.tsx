import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import ConnectedAccountsSection from "@editor/components/shared/config/configSections/ConnectedAccountsSection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) =>
      typeof options === "object" && options && "account" in options
        ? `${key}:${String((options as { account: string }).account)}`
        : key,
  }),
}));

const state = vi.hoisted(() => ({
  disconnect: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("@editor/hooks/useConnectedAccounts", () => ({
  useConnectedAccounts: () => ({
    available: (provider: string) => provider === "microsoft",
    accounts: [
      {
        id: 4,
        provider: "microsoft",
        email: "pat@contoso.com",
        displayName: "Pat",
        status: "CONNECTED",
        personal: false,
        lastError: null,
        createdAt: null,
      },
      {
        id: 5,
        provider: "microsoft",
        email: "sam@fabrikam.com",
        displayName: "Sam",
        status: "NEEDS_RECONNECT",
        personal: true,
        lastError: null,
        createdAt: null,
      },
    ],
    connect: state.connect,
    disconnect: state.disconnect,
  }),
}));

function renderSection() {
  render(
    <MantineProvider>
      <ConnectedAccountsSection />
    </MantineProvider>,
  );
}

function disconnectButtonFor(id: number) {
  const row = screen.getByTestId(`connected-account-${id}`);
  const button = row.querySelectorAll("button");
  return button[button.length - 1];
}

describe("ConnectedAccountsSection", () => {
  beforeEach(() => {
    state.disconnect.mockReset();
    state.disconnect.mockResolvedValue(undefined);
  });

  it("asks before disconnecting and names the account", async () => {
    renderSection();
    fireEvent.click(disconnectButtonFor(4));

    expect(
      await screen.findByText(
        "connectedAccounts.disconnectConfirm.title:pat@contoso.com",
      ),
    ).toBeTruthy();
    expect(state.disconnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("confirm-disconnect"));
    await waitFor(() => expect(state.disconnect).toHaveBeenCalledWith(4));
  });

  it("keeps the account when the confirmation is cancelled", async () => {
    renderSection();
    fireEvent.click(disconnectButtonFor(5));
    await screen.findByText(
      "connectedAccounts.disconnectConfirm.title:sam@fabrikam.com",
    );
    fireEvent.click(screen.getByText("common.cancel"));
    await waitFor(() =>
      expect(
        screen.queryByText(
          "connectedAccounts.disconnectConfirm.title:sam@fabrikam.com",
        ),
      ).toBeNull(),
    );
    expect(state.disconnect).not.toHaveBeenCalled();
  });

  it("labels each account with its status and type", () => {
    renderSection();
    const connected = screen.getByTestId("connected-account-4");
    const stale = screen.getByTestId("connected-account-5");
    expect(connected.textContent).toContain(
      "connectedAccounts.status.connected",
    );
    expect(connected.textContent).toContain("connectedAccounts.work");
    expect(stale.textContent).toContain("connectedAccounts.status.needsSignIn");
    expect(stale.textContent).toContain("connectedAccounts.personal");
    expect(stale.textContent).toContain("connectedAccounts.needsReconnect");
  });
});
