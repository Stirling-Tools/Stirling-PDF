import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import { SoftwareUpdatesCard } from "@app/components/shared/config/configSections/preferences/SoftwareUpdatesCard";
import type { PreferencesSectionProps } from "@app/components/shared/config/configSections/preferences/PreferencesSection";
import {
  desktopUpdateService,
  type UpdateModeInfo,
} from "@app/services/desktopUpdateService";
import { updateService } from "@app/services/updateService";

const { checkTauriUpdate } = vi.hoisted(() => ({
  checkTauriUpdate: vi.fn().mockResolvedValue(false),
}));

vi.mock("@app/hooks/useDesktopInstall", () => ({
  useDesktopInstall: () => ({
    state: "idle",
    progress: null,
    errorMessage: null,
    tauriInstallReady: false,
    canInstall: null,
    actions: { startInstall: vi.fn(), restartApp: vi.fn() },
    checkTauriUpdate,
  }),
}));
vi.mock("@app/services/desktopUpdateService", () => ({
  desktopUpdateService: {
    getUpdateModeInfo: vi.fn(),
    setUpdateMode: vi.fn(),
  },
}));
vi.mock(
  "@core/components/shared/config/configSections/preferences/PreferencesSection",
  () => ({
    default: ({
      hideUpdateSection,
      desktopInstall,
      desktopUpdateMode,
    }: PreferencesSectionProps) =>
      hideUpdateSection ? null : (
        <SoftwareUpdatesCard
          desktopInstall={desktopInstall}
          desktopUpdateMode={desktopUpdateMode}
        />
      ),
  }),
);
vi.mock(
  "@app/components/shared/config/configSections/DefaultAppSettings",
  () => ({
    DefaultAppSettings: () => null,
  }),
);
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { appVersion: "3.0.1" } }),
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("3.0.1"),
}));
vi.mock("@app/hooks/useSaaSMode", () => ({ useSaaSMode: () => true }));
vi.mock("@app/components/shared/UpdateModal", () => ({ default: () => null }));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

function renderSection() {
  return render(
    <MantineProvider>
      <GeneralSection />
    </MantineProvider>,
  );
}

describe("desktop GeneralSection update policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(updateService, "getUpdateSummary").mockResolvedValue({
      latest_version: "3.0.2",
      max_priority: "normal",
      any_breaking: false,
    });
  });

  it("does not mount update controls or check updates before managed-disabled policy loads", async () => {
    let resolvePolicy!: (info: UpdateModeInfo) => void;
    vi.mocked(desktopUpdateService.getUpdateModeInfo).mockReturnValue(
      new Promise<UpdateModeInfo>((resolve) => {
        resolvePolicy = resolve;
      }),
    );

    renderSection();

    expect(
      screen.queryByRole("button", { name: "Check for Updates" }),
    ).not.toBeInTheDocument();
    expect(updateService.getUpdateSummary).not.toHaveBeenCalled();
    expect(checkTauriUpdate).not.toHaveBeenCalled();

    await act(async () => {
      resolvePolicy({ mode: "disabled", locked: true });
    });

    expect(
      screen.queryByRole("button", { name: "Check for Updates" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Update behavior")).not.toBeInTheDocument();
    expect(updateService.getUpdateSummary).not.toHaveBeenCalled();
    expect(checkTauriUpdate).not.toHaveBeenCalled();
  });

  it.each<UpdateModeInfo>([
    { mode: "prompt", locked: false },
    { mode: "auto", locked: true },
    { mode: "disabled", locked: false },
  ])(
    "shows settings after $mode / locked=$locked policy loads",
    async (info) => {
      vi.mocked(desktopUpdateService.getUpdateModeInfo).mockResolvedValue(info);

      renderSection();

      expect(await screen.findByText("3.0.2")).toBeInTheDocument();
      expect(updateService.getUpdateSummary).toHaveBeenCalled();
      const control = screen.getByLabelText("Update behavior");
      if (info.locked) expect(control).toBeDisabled();
      else expect(control).toBeEnabled();

      await waitFor(() => {
        if (info.mode === "disabled")
          expect(checkTauriUpdate).not.toHaveBeenCalled();
        else expect(checkTauriUpdate).toHaveBeenCalledOnce();
      });
    },
  );
});
