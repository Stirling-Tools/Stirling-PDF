import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppProviders } from "@editor/components/AppProviders";

const state = vi.hoisted(() => ({
  getConfig: vi.fn(),
  monitor: vi.fn(),
  preload: vi.fn(),
}));
vi.mock("@editor-proprietary/components/AppProviders", () => ({
  AppProviders: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentConfig: state.getConfig,
    subscribeToModeChanges: () => () => {},
  },
  JWT_EXPIRED_PROMPTED_KEY: "expiry",
}));
vi.mock("@editor/services/authService", () => ({
  authService: {
    isAuthenticated: async () => true,
    subscribeToAuth: () => () => {},
    getAuthToken: async () => null,
    hasManagedSession: async () => false,
  },
}));
vi.mock("@editor/services/tauriBackendService", () => ({
  tauriBackendService: {
    getBackendUrl: () => "http://localhost:8080",
    isOnline: true,
    subscribeToStatus: () => () => {},
  },
}));
vi.mock("@editor/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: { stop: vi.fn() },
}));
vi.mock("@editor/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: { preloadEndpoints: state.preload },
}));
vi.mock("@editor/hooks/useFirstLaunchCheck", () => ({
  useFirstLaunchCheck: () => ({ isFirstLaunch: false, setupComplete: true }),
}));
vi.mock("@editor/hooks/useDesktopUpdatePopup", () => ({
  useDesktopUpdatePopup: () => ({ state: {}, actions: {} }),
}));
vi.mock("@editor/hooks/useBackendInitializer", () => ({
  useBackendInitializer: state.monitor,
}));
vi.mock("@editor/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => false,
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@editor/contexts/SaaSTeamContext", () => ({
  SaaSTeamProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@mantine/core", () => {
  const Container = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Center: Container,
    Stack: Container,
    Text: Container,
    Loader: () => null,
  };
});
vi.mock("@editor/ui/Button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock("@editor/components/SetupWizard", () => ({
  SetupWizard: () => <div>Required sign-in</div>,
}));
vi.mock("@editor/components/DesktopConfigSync", () => ({
  DesktopConfigSync: () => null,
}));
vi.mock("@editor/components/DesktopQueryCacheReset", () => ({
  DesktopQueryCacheReset: () => null,
}));
vi.mock("@editor/components/DesktopBannerInitializer", () => ({
  DesktopBannerInitializer: () => null,
}));
vi.mock("@editor/components/SaveShortcutListener", () => ({
  SaveShortcutListener: () => null,
}));
vi.mock("@editor/components/LocalProcessingFolders", () => ({
  LocalProcessingFolders: () => null,
}));
vi.mock("@editor/components/shared/DiskConflictHost", () => ({
  DiskConflictHost: () => null,
}));
vi.mock("@editor/components/DesktopOnboardingModal", () => ({
  DesktopOnboardingModal: () => null,
}));
vi.mock("@editor/components/DesktopSaasOnboardingBootstrap", () => ({
  DesktopSaasOnboardingBootstrap: () => null,
}));
vi.mock(
  "@editor/components/onboarding/classificationDemo/ClassificationBackgroundRunner",
  () => ({ ClassificationBackgroundRunner: () => null }),
);
vi.mock("@editor/components/UsageLimitModalHost", () => ({
  default: () => null,
}));
vi.mock("@editor/components/SignInModal", () => ({ SignInModal: () => null }));
vi.mock("@editor-core/components/shared/UpdateModal", () => ({
  default: () => null,
}));

it("initializes backend monitoring and endpoint preload after a gate retry recovers configuration", async () => {
  state.getConfig.mockRejectedValue(new Error("Store unavailable"));
  render(<AppProviders>Workbench</AppProviders>);
  await screen.findByText("setup.error.policyUnavailable");
  expect(state.monitor).not.toHaveBeenCalledWith(true);
  expect(state.preload).not.toHaveBeenCalled();
  state.getConfig.mockResolvedValue({ mode: "saas", require_sign_in: true });
  fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
  await screen.findByText("Required sign-in");
  await waitFor(() => expect(state.monitor).toHaveBeenCalledWith(true));
  expect(state.preload).toHaveBeenCalledWith(
    expect.any(Array),
    "http://localhost:8080",
  );
  expect(screen.queryByText("Workbench")).toBeNull();
});
