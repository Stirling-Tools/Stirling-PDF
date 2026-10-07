import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AuthStatus } from "@app/services/authService";
import { DesktopAccessGate } from "@app/components/DesktopAccessGate";

const state = vi.hoisted(() => ({
  getConfig: vi.fn(),
  validate: vi.fn(),
  expired: vi.fn(),
  onAuth: (_status: AuthStatus) => {},
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentConfig: state.getConfig,
    subscribeToModeChanges: () => () => {},
  },
}));
vi.mock("@app/services/authService", () => ({
  authService: {
    getAuthStatus: () => "unauthenticated",
    subscribeToAuth: (listener: (status: AuthStatus) => void) => {
      state.onAuth = listener;
      return () => {};
    },
    hasManagedSession: state.validate,
    getAuthToken: async () => "token",
    isTokenExpiringSoon: state.expired,
  },
}));
vi.mock("@mantine/core", () => ({
  Center: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Loader: () => <div>Loading</div>,
}));
vi.mock("@app/ui/Button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock("@app/components/SetupWizard", () => ({
  SetupWizard: () => <div>Required sign-in</div>,
}));

beforeEach(() => {
  state.getConfig.mockReset().mockResolvedValue({
    mode: "saas",
    require_sign_in: true,
    saas_only: true,
  });
  state.validate.mockReset().mockResolvedValue(false);
  state.expired.mockReset().mockReturnValue(false);
});

it("withholds the workbench even if onboarding was previously completed", async () => {
  localStorage.setItem("stirling-desktop-onboarding-seen.v2", "true");
  render(
    <DesktopAccessGate>
      <div>Workbench</div>
    </DesktopAccessGate>,
  );
  expect(screen.queryByText("Workbench")).toBeNull();
  await screen.findByText("Required sign-in");
  expect(screen.queryByText("Workbench")).toBeNull();
});

it("admits a verified session and removes access on logout", async () => {
  state.validate.mockResolvedValue(true);
  render(
    <DesktopAccessGate>
      <div>Workbench</div>
    </DesktopAccessGate>,
  );
  await screen.findByText("Workbench");
  act(() => state.onAuth("authenticated"));
  state.validate.mockResolvedValue(false);
  act(() => state.onAuth("unauthenticated"));
  await screen.findByText("Required sign-in");
  expect(screen.queryByText("Workbench")).toBeNull();
});

it("does not let an in-flight validation reopen access after logout", async () => {
  let resolve: (value: boolean) => void = () => {};
  state.validate.mockReturnValueOnce(
    new Promise<boolean>((done) => {
      resolve = done;
    }),
  );
  render(
    <DesktopAccessGate>
      <div>Workbench</div>
    </DesktopAccessGate>,
  );
  await waitFor(() => expect(state.validate).toHaveBeenCalled());
  act(() => state.onAuth("authenticated"));
  act(() => state.onAuth("unauthenticated"));
  await act(async () => resolve(true));
  await screen.findByText("Required sign-in");
  expect(screen.queryByText("Workbench")).toBeNull();
});

it("allows unmanaged guest use without validating a session", async () => {
  state.getConfig.mockResolvedValue({ mode: "local", require_sign_in: false });
  render(
    <DesktopAccessGate>
      <div>Workbench</div>
    </DesktopAccessGate>,
  );
  await screen.findByText("Workbench");
  expect(state.validate).not.toHaveBeenCalled();
});

it("closes access on expiry even while a refresh request is pending", async () => {
  state.validate
    .mockResolvedValueOnce(true)
    .mockReturnValue(new Promise(() => {}));
  render(
    <DesktopAccessGate>
      <div>Workbench</div>
    </DesktopAccessGate>,
  );
  await screen.findByText("Workbench");
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(state.validate).toHaveBeenCalledTimes(2));
  state.expired.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByText("Required sign-in");
  expect(screen.queryByText("Workbench")).toBeNull();
});

it("does not grant access when policy loading fails", async () => {
  state.getConfig.mockRejectedValue(new Error("Unreadable policy"));
  render(
    <DesktopAccessGate>
      <div>Workbench</div>
    </DesktopAccessGate>,
  );
  await screen.findByText("setup.error.policyUnavailable");
  expect(screen.queryByText("Workbench")).toBeNull();
});
