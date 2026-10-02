import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { BillingSettingsSection } from "@app/components/settings/BillingSettingsSection";
import { connectionModeService } from "@app/services/connectionModeService";
import { openExternal } from "@app/platform/openExternal";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/platform/openExternal", () => ({ openExternal: vi.fn() }));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { getCurrentConfig: vi.fn() },
}));
beforeEach(() => {
  vi.mocked(connectionModeService.getCurrentConfig).mockResolvedValue({
    mode: "saas",
    server_config: null,
    lock_connection_mode: false,
  });
  vi.mocked(openExternal).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

function show(mode: "saas" | "selfhosted" = "saas") {
  render(
    <MantineProvider>
      <BillingSettingsSection mode={mode} />
    </MantineProvider>,
  );
}

it.each(["https://cloud.example/app", "https://cloud.example/app/"])(
  "opens current billing under the configured web path: %s",
  async (base) => {
    vi.stubEnv("VITE_SAAS_FRONTEND_URL", base);
    vi.mocked(openExternal).mockResolvedValue(undefined);
    show();
    expect(openExternal).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Sign in with the same Stirling account/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
    );
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(
        "https://cloud.example/app/settings/billing",
      ),
    );
  },
);

it("lets the user retry when the system browser cannot open", async () => {
  vi.stubEnv("VITE_SAAS_FRONTEND_URL", "https://cloud.example/app");
  vi.mocked(openExternal)
    .mockRejectedValueOnce(new Error("Shell unavailable"))
    .mockResolvedValueOnce(undefined);
  show();
  fireEvent.click(
    screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
  );
  expect(
    await screen.findByText(/Could not open Usage & Billing/),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
  );
  await waitFor(() => expect(openExternal).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/Could not open Usage & Billing/)).toBeNull();
});

it.each([
  [
    "https://server.example/stirling/",
    "https://server.example/stirling/settings/billing",
  ],
  ["http://localhost:8080", "http://localhost:8080/settings/billing"],
  [
    "https://user:password@server.example/stirling?token=private#section",
    "https://server.example/stirling/settings/billing",
  ],
])("opens the connected server's billing page: %s", async (base, expected) => {
  vi.mocked(connectionModeService.getCurrentConfig).mockResolvedValue({
    mode: "selfhosted",
    server_config: { url: base },
    lock_connection_mode: false,
  });
  vi.mocked(openExternal).mockResolvedValue(undefined);
  show("selfhosted");
  expect(
    screen.getByText(/Sign in with your server owner account/),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
  );
  await waitFor(() => expect(openExternal).toHaveBeenCalledWith(expected));
});

it.each([null, "not-a-url", "javascript:alert(1)", "file:///tmp/server"])(
  "does not fall back to SaaS for an invalid server URL: %s",
  async (base) => {
    vi.mocked(connectionModeService.getCurrentConfig).mockResolvedValue({
      mode: "selfhosted",
      server_config: base ? { url: base } : null,
      lock_connection_mode: false,
    });
    show("selfhosted");
    fireEvent.click(
      screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
    );
    expect(
      await screen.findByText(/Could not open Usage & Billing/),
    ).toBeVisible();
    expect(openExternal).not.toHaveBeenCalled();
  },
);

it("reads the current server when opening billing", async () => {
  show("selfhosted");
  vi.mocked(connectionModeService.getCurrentConfig).mockResolvedValue({
    mode: "selfhosted",
    server_config: { url: "https://new-server.example" },
    lock_connection_mode: false,
  });
  vi.mocked(openExternal).mockResolvedValue(undefined);
  fireEvent.click(
    screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
  );
  await waitFor(() =>
    expect(openExternal).toHaveBeenCalledWith(
      "https://new-server.example/settings/billing",
    ),
  );
});

it("does not open a stale billing destination after switching to local mode", async () => {
  show();
  vi.mocked(connectionModeService.getCurrentConfig).mockResolvedValue({
    mode: "local",
    server_config: null,
    lock_connection_mode: false,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
  );
  expect(
    await screen.findByText(/Could not open Usage & Billing/),
  ).toBeVisible();
  expect(openExternal).not.toHaveBeenCalled();
});
