import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ApiKey } from "@portal/api/infrastructure";

// Deterministic i18n: keys returned verbatim, so assertions are stable.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// Stub the API layer so no real request is made. vi.hoisted keeps the mock fns
// defined before the hoisted vi.mock factory runs; createApiKey is present
// because the CreateKeyModal child imports it from the same module.
const { fetchApiKeys, revokeApiKey, createApiKey } = vi.hoisted(() => ({
  fetchApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
  createApiKey: vi.fn(),
}));
vi.mock("@portal/api/infrastructure", () => ({
  fetchApiKeys,
  revokeApiKey,
  createApiKey,
}));

import { ApiKeysTab } from "@portal/components/infrastructure/ApiKeysTab";

const K = "portal.infrastructure.apiKeys";

function apiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: "1",
    name: "Production ingest",
    prefix: "sk_a1b2c3d4",
    created: "2026-07-10",
    lastUsed: "2026-07-15 09:30",
    status: "active",
    usageToday: 12,
    usageMonth: 340,
    usageTotal: 9001,
    ...overrides,
  };
}

function renderTab() {
  return render(
    <MantineProvider>
      <ApiKeysTab />
    </MantineProvider>,
  );
}

describe("ApiKeysTab", () => {
  it("renders the empty state when the caller has no keys", async () => {
    fetchApiKeys.mockResolvedValueOnce({ keys: [] });
    renderTab();

    expect(await screen.findByText(`${K}.empty.title`)).toBeInTheDocument();
  });

  it("lists keys with their prefix, and keeps revoked keys visible", async () => {
    fetchApiKeys.mockResolvedValueOnce({
      keys: [
        apiKey({ id: "1", name: "Production ingest", prefix: "sk_a1b2c3d4" }),
        apiKey({
          id: "2",
          name: "Old key",
          prefix: "sk_z9y8x7w6",
          status: "revoked",
        }),
      ],
    });
    renderTab();

    expect(await screen.findByText("Production ingest")).toBeInTheDocument();
    expect(screen.getByText("sk_a1b2c3d4")).toBeInTheDocument();
    expect(screen.getByText("Old key")).toBeInTheDocument();
  });

  it("surfaces a load error instead of a misleading empty state", async () => {
    fetchApiKeys.mockRejectedValueOnce(new Error("boom"));
    renderTab();

    expect(await screen.findByText(`${K}.error.load`)).toBeInTheDocument();
    // A failed load must not render as "no keys yet".
    expect(screen.queryByText(`${K}.empty.title`)).not.toBeInTheDocument();
  });

  it("revokes a key after confirmation and reloads the list", async () => {
    fetchApiKeys
      .mockResolvedValueOnce({
        keys: [apiKey({ id: "7", name: "Doomed key" })],
      })
      .mockResolvedValueOnce({
        keys: [apiKey({ id: "7", name: "Doomed key", status: "revoked" })],
      });
    revokeApiKey.mockResolvedValueOnce(undefined);
    renderTab();

    // Expand the card so the revoke action is reachable.
    fireEvent.click(await screen.findByText("Doomed key"));
    fireEvent.click(
      await screen.findByRole("button", { name: `${K}.card.revoke` }),
    );

    // Confirm in the dialog (a distinct i18n key from the card action).
    const confirm = await screen.findByRole("button", {
      name: `${K}.revoke.confirm`,
    });
    fireEvent.click(confirm);

    // The revoke targets the right key, then the confirm dialog closes and the
    // list re-fetches to reflect the new state.
    await waitFor(() => expect(revokeApiKey).toHaveBeenCalledWith("7"));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: `${K}.revoke.confirm` }),
      ).not.toBeInTheDocument(),
    );
    expect(fetchApiKeys.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
