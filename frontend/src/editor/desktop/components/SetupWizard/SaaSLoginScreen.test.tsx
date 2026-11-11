import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { SaaSLoginScreen } from "@editor/components/SetupWizard/SaaSLoginScreen";
import { openExternal } from "@editor/platform/openExternal";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@editor/platform/openExternal", () => ({ openExternal: vi.fn() }));
vi.mock("@editor/components/SetupWizard/DesktopOAuthButtons", () => ({
  DesktopOAuthButtons: () => null,
}));

beforeEach(() => {
  vi.mocked(openExternal).mockReset();
  vi.stubEnv("VITE_SAAS_FRONTEND_URL", "https://cloud.example/app");
});
afterEach(() => vi.unstubAllEnvs());

function show() {
  render(
    <MantineProvider>
      <SaaSLoginScreen
        serverUrl="https://auth.example"
        onLogin={vi.fn()}
        onOAuthSuccess={vi.fn()}
        onSwitchToSignup={vi.fn()}
        loading={false}
        error={null}
      />
    </MantineProvider>,
  );
}

const forgotPassword = () =>
  screen.getByRole("button", { name: "Forgot your password?" });

it("opens the web reset page under the configured web path", async () => {
  vi.mocked(openExternal).mockResolvedValue(undefined);
  show();
  fireEvent.click(forgotPassword());
  await waitFor(() =>
    expect(openExternal).toHaveBeenCalledWith(
      "https://cloud.example/app/auth/reset",
    ),
  );
});

it("says so when the system browser cannot open, and clears on retry", async () => {
  vi.mocked(openExternal)
    .mockRejectedValueOnce(new Error("Shell unavailable"))
    .mockResolvedValueOnce(undefined);
  show();
  fireEvent.click(forgotPassword());
  expect(
    await screen.findByText(
      "Could not open your browser to reset your password.",
    ),
  ).toBeVisible();
  fireEvent.click(forgotPassword());
  await waitFor(() => expect(openExternal).toHaveBeenCalledTimes(2));
  expect(
    screen.queryByText("Could not open your browser to reset your password."),
  ).toBeNull();
});

it("reports a missing web URL instead of opening anything", async () => {
  vi.stubEnv("VITE_SAAS_FRONTEND_URL", "");
  show();
  fireEvent.click(forgotPassword());
  expect(
    await screen.findByText(
      "Could not open your browser to reset your password.",
    ),
  ).toBeVisible();
  expect(openExternal).not.toHaveBeenCalled();
});
