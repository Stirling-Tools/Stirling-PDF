import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import CompanySso from "@app/routes/CompanySso";

const { request, companySession, originalSession, exchange, appSession } =
  vi.hoisted(() => ({
    request: vi.fn(),
    companySession: vi.fn(),
    originalSession: vi.fn(),
    exchange: vi.fn(),
    appSession: vi.fn(),
  }));
vi.mock("@app/services/companySso", () => ({
  companySsoRequest: request,
  companyAuth: { auth: { getSession: companySession } },
  originalAuth: { auth: { getSession: originalSession } },
  companySsoError: (e: Error) => e.message,
  exchangeCompanyCode: exchange,
}));
vi.mock("@app/auth/supabase", () => ({
  supabase: { auth: { getSession: appSession } },
}));
vi.mock("@app/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/company-sso?connection=company-1");
  companySession.mockResolvedValue({ data: { session: null } });
  originalSession.mockResolvedValue({ data: { session: null } });
  appSession.mockResolvedValue({ data: { session: null } });
  exchange.mockResolvedValue({ error: null });
});

it("requires explicit confirmation before admitting the returned company login", async () => {
  sessionStorage.setItem("company-sso-attempt", "one-time-attempt");
  sessionStorage.setItem("company-sso-connection", "company-1");
  companySession.mockResolvedValue({
    data: {
      session: {
        access_token: "company-token",
        user: { email: "member@example.com" },
      },
    },
  });
  request.mockResolvedValue({ active: true, teamName: "Company" });
  render(
    <MantineProvider>
      <CompanySso />
    </MantineProvider>,
  );
  const confirm = await screen.findByRole("button", {
    name: "Continue to my company team",
  });
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await screen.findByText("Your account is connected");
  expect(request).toHaveBeenCalledWith("complete", "company-token", {
    attempt: "one-time-attempt",
    originalAccessToken: undefined,
  });
  expect(sessionStorage.getItem("company-sso-attempt")).toBeNull();
});

it("never offers a stored company session without its browser ceremony", async () => {
  companySession.mockResolvedValue({
    data: {
      session: { access_token: "stale", user: { email: "old@example.com" } },
    },
  });
  render(
    <MantineProvider>
      <CompanySso />
    </MantineProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continue with company SSO" }),
    ).not.toBeDisabled(),
  );
  expect(
    screen.queryByRole("button", { name: "Continue to my company team" }),
  ).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});

it("shows failed callbacks without provisioning an application account", async () => {
  window.history.replaceState(
    null,
    "",
    "/company-sso?connection=company-1&error=access_denied",
  );
  render(
    <StrictMode>
      <MantineProvider>
        <CompanySso />
      </MantineProvider>
    </StrictMode>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "cancelled or failed",
  );
  expect(request).not.toHaveBeenCalled();
});

it("does not reuse an attempt or company identity from a different team", async () => {
  sessionStorage.setItem("company-sso-attempt", "old-attempt");
  sessionStorage.setItem("company-sso-connection", "other-company");
  companySession.mockResolvedValue({
    data: {
      session: {
        access_token: "other-company-token",
        user: { email: "old@example.com" },
      },
    },
  });
  render(
    <MantineProvider>
      <CompanySso />
    </MantineProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continue with company SSO" }),
    ).not.toBeDisabled(),
  );
  expect(
    screen.queryByRole("button", { name: "Continue to my company team" }),
  ).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
