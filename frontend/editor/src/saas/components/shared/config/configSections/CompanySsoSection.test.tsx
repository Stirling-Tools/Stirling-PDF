import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import CompanySsoSection from "@app/components/shared/config/configSections/CompanySsoSection";
import type { CompanySsoSettings } from "@app/services/companySso";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@app/services/companySso", () => ({
  companySsoRequest: request,
  companySsoError: (error: Error) => error.message,
}));
vi.mock("@app/auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "leader" } },
      }),
    },
  },
}));
vi.mock("@app/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

beforeEach(() => vi.clearAllMocks());

function renderSettings(overrides: Partial<CompanySsoSettings> = {}) {
  request.mockResolvedValue({
    available: true,
    eligible: true,
    connectionId: "company-1",
    active: false,
    tested: true,
    connectedUserIds: [4],
    entityId: "https://example.com/saml/metadata",
    acsUrl: "https://example.com/saml/acs",
    ...overrides,
  } satisfies CompanySsoSettings);
  render(
    <MantineProvider>
      <CompanySsoSection />
    </MantineProvider>,
  );
}

it("offers setup and testing to an entitled team", async () => {
  renderSettings();
  expect(
    await screen.findByRole("button", { name: "Test and connect my account" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Save SAML connection" }),
  ).toBeVisible();
});

it("hides draft setup and activation when Enterprise access ends", async () => {
  renderSettings({ eligible: false });
  expect(
    await screen.findByText(
      "Company SSO setup requires an active Enterprise plan or trial.",
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save SAML connection" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Require company SSO" }),
  ).toBeNull();
});

it("keeps the company link visible after expiry and explains the admission restriction", async () => {
  renderSettings({ eligible: false, active: true });
  const link = await screen.findByLabelText<HTMLInputElement>(
    "Company sign-in link",
  );
  expect(link.value).toContain("/company-sso?connection=company-1");
  expect(
    screen.getByText("Company SSO is required for this team."),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Enterprise access has ended. Existing members can still use company SSO. New members can join after Enterprise access is renewed.",
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Require company SSO" }),
  ).toBeNull();
});

it("does not describe an operator pause as expired Enterprise access", async () => {
  renderSettings({ available: false, eligible: false, active: true });
  expect(
    await screen.findByText(
      "Company SSO setup and sign-in are temporarily unavailable. Contact Stirling support.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/Enterprise access has ended/)).toBeNull();
});
