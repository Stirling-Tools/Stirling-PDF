import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { StrictMode, type ReactNode } from "react";

const getMock = vi.fn();
const postMock = vi.fn();
const navigateMock = vi.fn();
let session: { access_token: string } | null = { access_token: "token-abc" };
const search = "?authorization_id=auth-123";

vi.mock("@app/services/apiClient", () => ({
  default: {
    get: (...a: unknown[]) => getMock(...a),
    post: (...a: unknown[]) => postMock(...a),
  },
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ session, loading: false, displayName: "Ada" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: unknown) =>
      typeof fallback === "string"
        ? fallback
        : ((fallback as { defaultValue?: string })?.defaultValue ?? _key),
  }),
}));

vi.mock("@app/hooks/useDocumentMeta", () => ({ useDocumentMeta: () => {} }));

vi.mock("@app/routes/oauth/OAuthPageShell", () => ({
  OAuthPageShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@app/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: "/oauth/consent", search }),
  };
});

const OAuthConsent = (await import("@app/routes/OAuthConsent")).default;

const assign = vi.fn();

function renderPage(strict = false) {
  const page = (
    <MantineProvider>
      <MemoryRouter>
        <OAuthConsent />
      </MemoryRouter>
    </MantineProvider>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}

describe("OAuthConsent (built-in MCP authorization server)", () => {
  beforeEach(() => {
    session = { access_token: "token-abc" };
    getMock.mockReset();
    postMock.mockReset();
    navigateMock.mockReset();
    assign.mockReset();
    // jsdom's location is not assignable; swap in a stub we can observe.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, pathname: "/oauth/consent", search: "" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the client, its domain and the offline_access scope", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        authorization_id: "auth-123",
        scope: "mcp.tools.read mcp.tools.write offline_access",
        client: { name: "ChatGPT", domain: "chatgpt.com" },
      },
    });

    renderPage();

    expect(await screen.findByText(/ChatGPT wants to access/)).toBeTruthy();
    expect(screen.getByText("Published by chatgpt.com")).toBeTruthy();
    expect(screen.getByText(/Stay connected without asking/)).toBeTruthy();
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/mcp/oauth/authorizations/auth-123",
    );
  });

  it("posts the decision and follows the returned redirect", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        authorization_id: "auth-123",
        scope: "mcp.tools.read",
        client: { name: "Claude" },
      },
    });
    postMock.mockResolvedValueOnce({
      data: {
        redirect_url: "https://claude.ai/cb?code=c&iss=https%3A%2F%2Fpdf",
      },
    });

    renderPage();
    fireEvent.click(await screen.findByText("Allow access"));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "https://claude.ai/cb?code=c&iss=https%3A%2F%2Fpdf",
      ),
    );
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/mcp/oauth/authorizations/auth-123/consent",
      { action: "approve" },
    );
  });

  it("follows an already-granted redirect once, even under StrictMode", async () => {
    getMock.mockResolvedValue({
      data: { redirect_url: "https://client.example/cb?code=xyz" },
    });

    renderPage(true);

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://client.example/cb?code=xyz"),
    );
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/wants to access/)).toBeNull();
  });

  it("shows an error instead of a nameless consent screen", async () => {
    getMock.mockRejectedValueOnce(new Error("400"));

    renderPage();

    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
    expect(screen.queryByText("Allow access")).toBeNull();
  });

  it("sends a signed-out visitor to login and back", async () => {
    session = null;

    renderPage();

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        `/login?from=${encodeURIComponent("/oauth/consent?authorization_id=auth-123")}`,
        { replace: true },
      ),
    );
    expect(getMock).not.toHaveBeenCalled();
  });
});
