import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { BillingSettingsSection } from "@app/components/settings/BillingSettingsSection";
import { openExternal } from "@app/platform/openExternal";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/platform/openExternal", () => ({ openExternal: vi.fn() }));
beforeEach(() => {
  vi.mocked(openExternal).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

function show() {
  render(
    <MantineProvider>
      <BillingSettingsSection />
    </MantineProvider>,
  );
}

it.each(["https://cloud.example/app", "https://cloud.example/app/"])(
  "opens current billing under the configured web path: %s",
  async (base) => {
    vi.stubEnv("VITE_SAAS_FRONTEND_URL", base);
    vi.mocked(openExternal).mockResolvedValue(undefined);
    show();
    expect(openExternal).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Sign in with the same Stirling account/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
    );
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(
        "https://cloud.example/app/settings/billing",
      ),
    );
  },
);

it("lets the user retry when the system browser cannot open", async () => {
  vi.stubEnv("VITE_SAAS_FRONTEND_URL", "https://cloud.example/app");
  vi.mocked(openExternal)
    .mockRejectedValueOnce(new Error("Shell unavailable"))
    .mockResolvedValueOnce(undefined);
  show();
  fireEvent.click(
    screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
  );
  expect(await screen.findByText(/Could not open your browser/)).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Open Usage & Billing in browser" }),
  );
  await waitFor(() => expect(openExternal).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/Could not open your browser/)).toBeNull();
});
