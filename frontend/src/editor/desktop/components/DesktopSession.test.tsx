import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { DesktopSessionProvider } from "@editor/components/DesktopSession";
import { AppContentGate } from "@editor/components/layout/AppContentGate";

const state = vi.hoisted(() => ({
  getConfig: vi.fn(),
  monitor: vi.fn(),
  preload: vi.fn(),
  switchToLocal: vi.fn(),
  startBackend: vi.fn(),
  launch: { isFirstLaunch: false, setupComplete: true },
  authenticated: true,
}));
vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentConfig: state.getConfig,
    subscribeToModeChanges: () => () => {},
    switchToLocal: state.switchToLocal,
    getServerConfig: async () => null,
  },
  JWT_EXPIRED_PROMPTED_KEY: "expiry",
}));
vi.mock("@editor/services/authService", () => ({
  authService: {
    isAuthenticated: async () => state.authenticated,
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
    startBackend: state.startBackend,
    initializeExternalBackend: async () => undefined,
  },
}));
vi.mock("@editor/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: { stop: vi.fn() },
}));
vi.mock("@editor/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: { preloadLocalCapabilities: state.preload },
}));
vi.mock("@editor/hooks/useFirstLaunchCheck", () => ({
  useFirstLaunchCheck: () => state.launch,
}));
vi.mock("@editor/components/DesktopUpdatePopup", () => ({
  DesktopUpdatePopup: () => null,
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
vi.mock("@editor/components/LocalProcessingFolders", () => ({
  LocalProcessingFolders: () => null,
}));
vi.mock("@editor/components/ProcessorPageHandlers", () => ({
  ProcessorPageHandlers: () => null,
}));
vi.mock("@editor-core/components/startup/StartupPrompts", () => ({
  StartupPrompts: () => null,
}));
vi.mock("@editor/components/UsageLimitModalHost", () => ({
  default: () => null,
}));
vi.mock("@editor/components/SignInModal", async () => {
  const { useEffect, useState } = await import("react");
  const { OPEN_SIGN_IN_EVENT } = await import("@editor/constants/signInEvents");
  return {
    SignInModal: () => {
      const [open, setOpen] = useState(false);
      useEffect(() => {
        const show = () => setOpen(true);
        window.addEventListener(OPEN_SIGN_IN_EVENT, show);
        return () => window.removeEventListener(OPEN_SIGN_IN_EVENT, show);
      }, []);
      return open ? <div>Sign-in prompt</div> : null;
    },
  };
});

it("initializes backend monitoring and endpoint preload after a gate retry recovers configuration", async () => {
  state.getConfig.mockRejectedValue(new Error("Store unavailable"));
  render(
    <DesktopSessionProvider>
      <AppContentGate>Workbench</AppContentGate>
    </DesktopSessionProvider>,
  );
  await screen.findByText("setup.error.policyUnavailable");
  expect(state.monitor).not.toHaveBeenCalledWith(true);
  expect(state.preload).not.toHaveBeenCalled();
  state.getConfig.mockResolvedValue({ mode: "saas", require_sign_in: true });
  fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
  await screen.findByText("Required sign-in");
  await waitFor(() => expect(state.monitor).toHaveBeenCalledWith(true));
  expect(state.preload).toHaveBeenCalledWith("http://localhost:8080");
  expect(screen.queryByText("Workbench")).toBeNull();
});

it("shows the app on first launch without waiting for the backend to start", async () => {
  state.launch = { isFirstLaunch: true, setupComplete: false };
  state.getConfig.mockResolvedValue({ mode: "saas" });
  state.switchToLocal.mockResolvedValue(undefined);
  state.startBackend.mockReturnValue(new Promise(() => {}));
  render(
    <DesktopSessionProvider>
      <AppContentGate>Workbench</AppContentGate>
    </DesktopSessionProvider>,
  );
  await screen.findByText("Workbench");
  expect(state.startBackend).toHaveBeenCalled();
});

it("offers sign-in once an expired session has fallen back to local mode", async () => {
  state.launch = { isFirstLaunch: false, setupComplete: true };
  state.authenticated = false;
  localStorage.removeItem("expiry");
  state.getConfig.mockResolvedValue({
    mode: "selfhosted",
    lock_connection_mode: false,
    require_sign_in: false,
  });
  state.switchToLocal.mockResolvedValue(undefined);
  render(
    <DesktopSessionProvider>
      <AppContentGate>Workbench</AppContentGate>
    </DesktopSessionProvider>,
  );
  await screen.findByText("Sign-in prompt");
  expect(state.switchToLocal).toHaveBeenCalled();
});
