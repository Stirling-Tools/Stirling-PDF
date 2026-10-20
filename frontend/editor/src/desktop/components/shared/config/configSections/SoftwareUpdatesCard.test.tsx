import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { getVersion } from "@tauri-apps/api/app";
import { SoftwareUpdatesCard } from "@app/components/shared/config/configSections/preferences/SoftwareUpdatesCard";
import { useSaaSMode } from "@app/hooks/useSaaSMode";
import { updateService } from "@app/services/updateService";
import { expectConsole } from "@app/tests/failOnConsole";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@app/hooks/useSaaSMode", () => ({ useSaaSMode: vi.fn() }));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: {
      appVersion: "2.9.0",
      machineType: "Client-win",
      activeSecurity: false,
      license: "NORMAL",
    },
  }),
}));
vi.mock("@app/components/shared/UpdateModal", () => ({
  default: () => null,
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

function renderCard() {
  return render(
    <MantineProvider>
      <SoftwareUpdatesCard
        desktopUpdateMode={{ mode: "prompt", locked: false, onChange: vi.fn() }}
      />
    </MantineProvider>,
  );
}

describe("desktop SoftwareUpdatesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVersion).mockResolvedValue("3.0.1");
    vi.mocked(useSaaSMode).mockReturnValue(true);
    vi.spyOn(updateService, "getUpdateSummary").mockResolvedValue({
      latest_version: "3.0.2",
      max_priority: "normal",
      any_breaking: false,
    });
  });

  it("shows app updates without backend information or mismatch warnings in SaaS mode", async () => {
    renderCard();

    expect(await screen.findByText("3.0.1")).toBeInTheDocument();
    expect(screen.getByText(/Desktop Version/)).toBeInTheDocument();
    expect(screen.queryByText(/Frontend Version/)).not.toBeInTheDocument();
    expect(await screen.findByText("3.0.2")).toBeInTheDocument();
    expect(screen.queryByText(/Server Version/)).not.toBeInTheDocument();
    expect(screen.queryByText("2.9.0")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/desktop application and server/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check for Updates" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Update behavior")).toBeEnabled();
    expect(updateService.getUpdateSummary).toHaveBeenCalledWith("3.0.1", {
      machineType: "Client-win",
      activeSecurity: false,
      licenseType: "NORMAL",
    });
    expect(updateService.getUpdateSummary).not.toHaveBeenCalledWith(
      "2.9.0",
      expect.anything(),
    );
  });

  it("waits for the app version instead of checking the backend version in SaaS mode", () => {
    vi.mocked(getVersion).mockReturnValue(new Promise<string>(() => {}));

    renderCard();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check for Updates" }),
    ).toBeDisabled();
    expect(screen.queryByText(/Server Version/)).not.toBeInTheDocument();
    expect(updateService.getUpdateSummary).not.toHaveBeenCalled();
  });

  it("keeps backend information outside SaaS mode and removes it when switching to SaaS", async () => {
    vi.mocked(useSaaSMode).mockReturnValue(false);
    expectConsole.warn(
      /Mismatch between frontend version and AppConfig version/,
    );

    const { rerender } = renderCard();

    expect(
      await screen.findByText(/desktop application and server/),
    ).toBeInTheDocument();
    expect(screen.getByText("2.9.0")).toBeInTheDocument();
    expect(screen.getByText(/Server Version/)).toBeInTheDocument();
    expect(screen.queryByText(/AppConfig/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Current Backend Version/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Desktop Version/)).toBeInTheDocument();

    vi.mocked(useSaaSMode).mockReturnValue(true);
    rerender(
      <MantineProvider>
        <SoftwareUpdatesCard />
      </MantineProvider>,
    );

    expect(screen.queryByText(/Server Version/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/desktop application and server/),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("3.0.2")).toBeInTheDocument());
  });
});
