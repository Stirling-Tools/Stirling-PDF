import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { allowConsole } from "@app/tests/failOnConsole";

const { pluginFetch, testConnection } = vi.hoisted(() => ({
  pluginFetch: vi.fn(),
  testConnection: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { testConnection },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import { ServerSelection } from "@app/components/SetupWizard/ServerSelection";

const SERVER = "https://pdf.example.test";

function renderSelection(onSelect = vi.fn()) {
  render(
    <MantineProvider>
      <ServerSelection onSelect={onSelect} loading={false} />
    </MantineProvider>,
  );
  return onSelect;
}

describe("ServerSelection server configuration fetch", () => {
  beforeEach(() => {
    pluginFetch.mockReset();
    testConnection.mockReset();
    testConnection.mockResolvedValue({ success: true });
    localStorage.clear();
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("reads the login config through the native HTTP client, not the webview", async () => {
    pluginFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ loginMethod: "all", providerList: {} }),
    });

    const onSelect = renderSelection();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Server URL"), SERVER);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());

    expect(pluginFetch).toHaveBeenCalledWith(
      `${SERVER}/api/v1/proprietary/ui-data/login`,
    );
    // The webview's fetch is subject to the WebKit/CORS restrictions that made
    // this fail instantly with "Load failed" against a working server.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("passes the detected login method and providers on", async () => {
    pluginFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        loginMethod: "oauth2",
        providerList: { "/oauth2/authorization/google": "Google" },
      }),
    });

    const onSelect = renderSelection();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Server URL"), SERVER);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());

    expect(onSelect).toHaveBeenCalledWith({
      url: SERVER,
      loginMethod: "oauth2",
      enabledOAuthProviders: [
        { id: "google", path: "/oauth2/authorization/google", label: "Google" },
      ],
    });
  });

  test("treats a 404 login endpoint as security being disabled", async () => {
    allowConsole.warn(/Login config request failed with status 404/);
    pluginFetch.mockResolvedValue({ ok: false, status: 404 });

    const onSelect = renderSelection();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Server URL"), SERVER);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(screen.getByText("Login Not Enabled")).toBeInTheDocument(),
    );
    expect(onSelect).not.toHaveBeenCalled();
  });
});
