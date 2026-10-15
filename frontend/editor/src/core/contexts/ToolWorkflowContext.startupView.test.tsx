import "fake-indexeddb/auto";
import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { preferencesService } from "@app/services/preferencesService";
import apiClient from "@app/services/apiClient";
import type { AppConfig } from "@app/types/appConfig";

const STORAGE_KEY = "stirlingpdf_preferences";
const originalGet = apiClient.get.bind(apiClient);

function LaunchProbe() {
  const workflow = useToolWorkflow();
  const { preferences } = usePreferences();
  const { configFromServer, loading } = useAppConfig();
  const { pathname } = useLocation();
  return (
    <div
      data-testid="launch"
      data-reader={String(workflow.readerMode)}
      data-tool={workflow.selectedToolKey ?? ""}
      data-panel={workflow.toolPanelMode}
      data-startup={preferences.defaultStartupView}
      data-mode={preferences.defaultToolPanelMode}
      data-from-server={String(configFromServer)}
      data-loading={String(loading)}
      data-path={pathname}
    />
  );
}

function GoHome() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/")}>
        home
      </button>
      <LaunchProbe />
    </>
  );
}

function renderLaunch(
  ui: ReactNode,
  options: {
    config?: AppConfig | null;
    path?: string;
    autoFetch?: boolean;
  } = {},
) {
  const { config = null, path = "/", autoFetch = false } = options;
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders
        appConfigProviderProps={{
          initialConfig: config,
          bootstrapMode: "non-blocking",
          autoFetch,
        }}
      >
        {ui}
      </AppProviders>
    </MemoryRouter>,
  );
  return screen.getByTestId("launch");
}

function renderWithConfig(config: AppConfig) {
  return renderLaunch(<LaunchProbe />, { config });
}

describe("server default reaches the launch view", () => {
  beforeEach(() => {
    localStorage.clear();
    preferencesService.clearServerDefaults();
  });

  it("opens reading from the server default when nothing is stored", async () => {
    const launch = renderWithConfig({
      defaultStartupView: "read",
      defaultToolPanelMode: "fullscreen",
    });

    await waitFor(() => {
      expect(launch).toHaveAttribute("data-reader", "true");
      expect(launch).toHaveAttribute("data-startup", "read");
      expect(launch).toHaveAttribute("data-panel", "fullscreen");
      expect(launch).toHaveAttribute("data-mode", "fullscreen");
    });
    // The server choice stays a default: it must not be written as the user's.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps a stored launch view ahead of the server default", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        defaultStartupView: "automate",
        defaultToolPanelMode: "sidebar",
      }),
    );
    const launch = renderWithConfig({
      defaultStartupView: "read",
      defaultToolPanelMode: "fullscreen",
    });

    await waitFor(() => {
      expect(launch).toHaveAttribute("data-tool", "automate");
      expect(launch).toHaveAttribute("data-reader", "false");
      expect(launch).toHaveAttribute("data-startup", "automate");
      expect(launch).toHaveAttribute("data-panel", "sidebar");
      expect(launch).toHaveAttribute("data-mode", "sidebar");
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toMatchObject(
      {
        defaultStartupView: "automate",
        defaultToolPanelMode: "sidebar",
      },
    );
  });

  it("applies a server default that arrives after mount", async () => {
    let resolveConfig: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveConfig = resolve;
    });
    const get = vi.spyOn(apiClient, "get").mockImplementation((url, config) => {
      if (String(url).includes("app-config")) return pending;
      return originalGet(url, config);
    });
    try {
      const launch = renderLaunch(<LaunchProbe />, { autoFetch: true });
      expect(launch).toHaveAttribute("data-reader", "false");
      expect(launch).toHaveAttribute("data-tool", "");
      expect(launch).toHaveAttribute("data-from-server", "false");

      await act(async () => {
        resolveConfig({
          status: 200,
          data: { defaultStartupView: "automate" },
        });
      });

      await waitFor(() => {
        expect(launch).toHaveAttribute("data-tool", "automate");
        expect(launch).toHaveAttribute("data-reader", "false");
        expect(launch).toHaveAttribute("data-startup", "automate");
        expect(launch).toHaveAttribute("data-from-server", "true");
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      get.mockRestore();
    }
  });

  it("ignores a 401 stand-in and applies the real server default", async () => {
    let appConfigCalls = 0;
    const get = vi.spyOn(apiClient, "get").mockImplementation((url, config) => {
      if (String(url).includes("app-config")) {
        appConfigCalls += 1;
        if (appConfigCalls === 1) {
          return Promise.reject(
            Object.assign(new Error("Unauthorized"), {
              response: { status: 401, data: {} },
            }),
          );
        }
        return Promise.resolve({
          status: 200,
          data: { enableLogin: true, defaultStartupView: "read" },
        });
      }
      return originalGet(url, config);
    });
    try {
      const launch = renderLaunch(<LaunchProbe />, { autoFetch: true });

      await waitFor(() => {
        expect(launch).toHaveAttribute("data-loading", "false");
      });
      // The cached login default must not spend the launch on "tools".
      expect(launch).toHaveAttribute("data-from-server", "false");
      expect(launch).toHaveAttribute("data-reader", "false");
      expect(launch).toHaveAttribute("data-startup", "tools");

      await act(async () => {
        window.dispatchEvent(new CustomEvent("jwt-available"));
      });

      await waitFor(() => {
        expect(launch).toHaveAttribute("data-reader", "true");
        expect(launch).toHaveAttribute("data-startup", "read");
        expect(launch).toHaveAttribute("data-from-server", "true");
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      get.mockRestore();
    }
  });

  it("applies the server default after signing in from /login", async () => {
    const launch = renderLaunch(<GoHome />, {
      config: { defaultStartupView: "read" },
      path: "/login",
    });

    expect(launch).toHaveAttribute("data-from-server", "true");
    expect(launch).toHaveAttribute("data-reader", "false");
    expect(launch).toHaveAttribute("data-startup", "read");

    fireEvent.click(screen.getByRole("button", { name: "home" }));

    await waitFor(() => {
      expect(launch).toHaveAttribute("data-reader", "true");
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does not replace a deep link when the editor home is opened later", async () => {
    const launch = renderLaunch(<GoHome />, {
      config: { defaultStartupView: "read" },
      path: "/compress",
    });

    expect(launch).toHaveAttribute("data-reader", "false");

    fireEvent.click(screen.getByRole("button", { name: "home" }));

    await waitFor(() => {
      expect(launch).toHaveAttribute("data-path", "/");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(launch).toHaveAttribute("data-reader", "false");
  });
});
