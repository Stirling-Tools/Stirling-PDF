import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SetupWizard } from "@app/components/SetupWizard";

const { getConfig } = vi.hoisted(() => ({ getConfig: vi.fn() }));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { getCurrentConfig: getConfig },
}));
vi.mock("@app/services/authService", () => ({ authService: {} }));
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {},
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("@mantine/core", () => ({
  Center: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Loader: () => <div>Loading</div>,
}));
vi.mock("@app/components/SetupWizard/DesktopAuthLayout", () => ({
  DesktopAuthLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/components/SetupWizard/SaaSLoginScreen", () => ({
  SaaSLoginScreen: ({
    onSelfHostedClick,
    onSkipSignIn,
    onClose,
  }: {
    onSelfHostedClick?: () => void;
    onSkipSignIn?: () => void;
    onClose?: () => void;
  }) => (
    <div>
      Cloud sign-in{onSelfHostedClick && <button>Self-hosted</button>}
      {onSkipSignIn && <button>Skip</button>}
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
vi.mock("@app/ui/Button", () => ({ Button: () => null }));

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
