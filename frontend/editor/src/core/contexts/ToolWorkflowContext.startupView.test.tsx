import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { preferencesService } from "@app/services/preferencesService";
import type { AppConfig } from "@app/types/appConfig";

const STORAGE_KEY = "stirlingpdf_preferences";

function LaunchProbe() {
  const workflow = useToolWorkflow();
  const { preferences } = usePreferences();
  return (
    <div
      data-testid="launch"
      data-reader={String(workflow.readerMode)}
      data-tool={workflow.selectedToolKey ?? ""}
      data-panel={workflow.toolPanelMode}
      data-startup={preferences.defaultStartupView}
      data-mode={preferences.defaultToolPanelMode}
    />
  );
}

function renderWithConfig(config: AppConfig) {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <AppProviders
        appConfigProviderProps={{
          initialConfig: config,
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <LaunchProbe />
      </AppProviders>
    </MemoryRouter>,
  );
  return screen.getByTestId("launch");
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
});
