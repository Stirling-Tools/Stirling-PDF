import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortalTestProviders } from "@processor/test/TestQueryProvider";
import { ConnectedAccountPicker } from "@processor/components/sources/ConnectedAccountPicker";
import { PopupBlockedError } from "@editor/services/connectedAccountsService";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const state = vi.hoisted(() => ({
  accounts: [] as Array<{ id: number; provider: string; status: string }>,
  connect: vi.fn(),
}));
vi.mock("@editor/hooks/useConnectedAccounts", () => ({
  useConnectedAccounts: () => ({
    available: () => true,
    accounts: state.accounts,
    connect: state.connect,
  }),
  latestConnectedAccounts: () => state.accounts,
}));

function account(status: string) {
  return { id: 7, provider: "microsoft", status, email: "pat@contoso.com" };
}

function renderPicker(onChange = vi.fn()) {
  render(
    <PortalTestProviders>
      <ConnectedAccountPicker
        provider="microsoft"
        value=""
        onChange={onChange}
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
});
