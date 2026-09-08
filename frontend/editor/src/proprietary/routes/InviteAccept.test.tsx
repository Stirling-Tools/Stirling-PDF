import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import InviteAccept from "@app/routes/InviteAccept";
import apiClient from "@app/services/apiClient";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (typeof fallback === "string") return fallback;
      return key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@app/i18n", () => ({
  updateSupportedLanguages: vi.fn(),
  supportedLanguages: { "en-US": "English (US)" },
  rtlLanguages: [],
  default: { language: "en-US", changeLanguage: vi.fn(), options: {} },
}));

vi.mock("@app/hooks/useDocumentMeta", () => ({
  useDocumentMeta: vi.fn(),
}));

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ token: "tok" }),
  };
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <TestQueryProvider>
    <MantineProvider>
      <PreferencesProvider>{children}</PreferencesProvider>
    </MantineProvider>
  </TestQueryProvider>
);

const renderInvite = () =>
  render(
    <TestWrapper>
      <MemoryRouter>
        <InviteAccept />
      </MemoryRouter>
    </TestWrapper>,
  );

describe("InviteAccept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        email: "invitee@example.com",
        role: "ROLE_USER",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        emailRequired: false,
      },
    });
  });

  it("shows the translated too-short message instead of posting a short password", async () => {
    const user = userEvent.setup({ delay: null });
    renderInvite();

    const password = await screen.findByPlaceholderText("Enter your password");
    const confirm = screen.getByPlaceholderText("Re-enter your password");

    await user.type(password, "short");
    await user.type(confirm, "short");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters"),
      ).toBeTruthy();
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("opts out of native validation so its own translated messages are shown", async () => {
    renderInvite();
    await screen.findByPlaceholderText("Enter your password");

    expect(document.querySelector("form")?.noValidate).toBe(true);
  });

  it("posts a password that meets the policy", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup({ delay: null });
    renderInvite();

    const password = await screen.findByPlaceholderText("Enter your password");
    const confirm = screen.getByPlaceholderText("Re-enter your password");

    await user.type(password, "secret12");
    await user.type(confirm, "secret12");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/invite/accept/tok",
        expect.any(FormData),
        expect.anything(),
      );
    });
  });
});
