import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortalTestProviders } from "@processor/test/TestQueryProvider";
import { ConnectedAccountPicker } from "@processor/components/sources/ConnectedAccountPicker";
import { PopupBlockedError } from "@editor/services/connectedAccountsService";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const state = vi.hoisted(() => ({
  available: true,
  accounts: [] as Array<{ id: number; provider: string; status: string }>,
  connect: vi.fn(),
}));
vi.mock("@editor/hooks/useConnectedAccounts", () => ({
  useConnectedAccounts: () => ({
    available: () => state.available,
    accounts: state.accounts,
    connect: state.connect,
  }),
  latestConnectedAccounts: () => state.accounts,
}));

function account(status: string) {
  return { id: 7, provider: "microsoft", status, email: "pat@contoso.com" };
}

function renderPicker(onChange = vi.fn(), onUnavailable?: () => void) {
  render(
    <PortalTestProviders>
      <ConnectedAccountPicker
        provider="microsoft"
        value=""
        onChange={onChange}
        onUnavailable={onUnavailable}
      />
    </PortalTestProviders>,
  );
  return onChange;
}

describe("ConnectedAccountPicker", () => {
  it("preselects the only account when it is connected", async () => {
    state.accounts = [account("CONNECTED")];
    const onChange = renderPicker();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("7"));
  });

  it("does not preselect an account that needs signing in again", () => {
    state.accounts = [account("NEEDS_RECONNECT")];
    const onChange = renderPicker();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("explains a blocked sign-in window", async () => {
    state.accounts = [];
    state.connect.mockRejectedValueOnce(new PopupBlockedError());
    renderPicker();
    fireEvent.click(
      screen.getByRole("button", {
        name: /portal.sources.cloudFields.account.connect/,
      }),
    );
    expect(
      await screen.findByText("connectedAccounts.popupBlocked"),
    ).toBeTruthy();
  });

  it("reports when connecting your own account is turned off", async () => {
    state.available = false;
    try {
      state.accounts = [];
      const onUnavailable = vi.fn();
      renderPicker(vi.fn(), onUnavailable);
      await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
    } finally {
      state.available = true;
    }
  });

  it("does not report an available provider", () => {
    state.accounts = [];
    const onUnavailable = vi.fn();
    renderPicker(vi.fn(), onUnavailable);
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
