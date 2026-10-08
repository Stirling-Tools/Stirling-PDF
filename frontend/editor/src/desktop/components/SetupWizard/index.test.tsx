import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SetupWizard } from "@app/components/SetupWizard";

const { getConfig } = vi.hoisted(() => ({ getConfig: vi.fn() }));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { getCurrentConfig: getConfig },
}));
vi.mock("@app/services/authService", () => ({
  authService: {},
  AuthServiceError: class extends Error {},
}));
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {},
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("@mantine/core", () => {
  const Container = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Center: Container,
    Stack: Container,
    Text: Container,
    Alert: Container,
    Loader: () => <div>Loading</div>,
  };
});
vi.mock("@app/ui/Button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock("@app/components/SetupWizard/DesktopAuthLayout", () => ({
  DesktopAuthLayout: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@app/components/SetupWizard/SaaSLoginScreen", () => ({
  SaaSLoginScreen: ({
    onSkipSignIn,
    onSelfHostedClick,
    onClose,
  }: {
    onSkipSignIn?: () => void;
    onSelfHostedClick?: () => void;
    onClose?: () => void;
  }) => (
    <div>
      Cloud sign-in{onSkipSignIn && <button>Skip</button>}
      {onSelfHostedClick && <button>Self-hosted</button>}
      {onClose && <button>Close</button>}
    </div>
  ),
}));
vi.mock("@app/components/SetupWizard/SaaSSignupScreen", () => ({
  SaaSSignupScreen: () => null,
}));
vi.mock("@app/components/SetupWizard/ServerSelectionScreen", () => ({
  ServerSelectionScreen: () => null,
}));
vi.mock("@app/components/SetupWizard/SelfHostedLoginScreen", () => ({
  SelfHostedLoginScreen: () => null,
}));
vi.mock("@app/components/shared/DisabledButtonWithTooltip", () => ({
  DisabledButtonWithTooltip: () => null,
}));

beforeEach(() => getConfig.mockReset());

it.each([
  { required: true, saasOnly: true, skip: false, selfHosted: false },
  { required: true, saasOnly: false, skip: false, selfHosted: true },
  { required: false, saasOnly: true, skip: true, selfHosted: false },
  { required: false, saasOnly: false, skip: true, selfHosted: true },
])(
  "applies independent sign-in policies: %j",
  async ({ required, saasOnly, skip, selfHosted }) => {
    getConfig.mockResolvedValue({
      mode: "saas",
      lock_connection_mode: false,
      require_sign_in: required,
      saas_only: saasOnly,
    });
    render(<SetupWizard onComplete={() => {}} onClose={() => {}} />);
    await screen.findByText("Cloud sign-in");
    expect(!!screen.queryByRole("button", { name: "Skip" })).toBe(skip);
    expect(!!screen.queryByRole("button", { name: "Self-hosted" })).toBe(
      selfHosted,
    );
    expect(!!screen.queryByRole("button", { name: "Close" })).toBe(!required);
  },
);

it("offers policy retries without showing unrestricted sign-in choices", async () => {
  getConfig.mockRejectedValue(new Error("Store unavailable"));
  const onComplete = vi.fn();
  render(<SetupWizard onComplete={onComplete} />);
  await screen.findByText("setup.error.policyUnavailable");
  expect(screen.queryByText("Cloud sign-in")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
  await screen.findByText("setup.error.policyUnavailable");
  getConfig.mockResolvedValue({
    mode: "saas",
    require_sign_in: true,
    saas_only: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
  await screen.findByText("Cloud sign-in");
  expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Self-hosted" })).toBeNull();
  expect(onComplete).not.toHaveBeenCalled();
});
