import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

// GoTrue returns a UNION from GET /oauth/authorizations/{id}: consent details on
// the first authorization for a (user, client), and a bare {redirect_url} on every
// later one because the stored grant auto-approves and the code is ALREADY issued.
// Treating the second shape as details discards that code and breaks every reconnect.

const fetchMock = vi.fn();
let search = "?authorization_id=auth-123";

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({
    session: { access_token: "token-abc" },
    loading: false,
    displayName: "Ada",
  }),
}));

vi.mock("@app/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: unknown) =>
      typeof fallback === "string"
        ? fallback
        : ((fallback as { defaultValue?: string })?.defaultValue ?? _key),
  }),
}));

vi.mock("@app/hooks/useDocumentMeta", () => ({ useDocumentMeta: () => {} }));

vi.mock("@app/routes/authShared/AuthLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@app/auth/ui/ErrorMessage", () => ({
  default: ({ error }: { error?: string | null }) =>
    error ? <div role="alert">{error}</div> : null,
}));

vi.mock("@app/ui/Button", () => ({
  Button: ({ children, ...rest }: { children: ReactNode }) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: "/oauth/consent", search }),
  };
});

const OAuthConsent = (await import("@app/routes/OAuthConsent")).default;

const json = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });

const assign = vi.fn();

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <OAuthConsent />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("OAuthConsent", () => {
  beforeEach(() => {
    search = "?authorization_id=auth-123";
    fetchMock.mockReset();
    assign.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // jsdom's location is not assignable; swap in a stub we can observe.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, pathname: "/oauth/consent", search: "" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the consent screen and names the requesting client", async () => {
    fetchMock.mockReturnValueOnce(
      json(200, {
        authorization_id: "auth-123",
        scope: "openid email",
        client: { name: "Claude" },
      }),
    );

    renderPage();

    expect(await screen.findByText(/Claude wants to access/)).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it("follows redirect_url instead of rendering consent when the grant already exists", async () => {
    fetchMock.mockReturnValueOnce(
      json(200, {
        redirect_url: "https://client.example/cb?code=xyz&state=s1",
      }),
    );

    renderPage();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "https://client.example/cb?code=xyz&state=s1",
      ),
    );
    // The already-issued code must not be thrown away behind a consent screen.
    expect(screen.queryByText(/wants to access/)).toBeNull();
  });

  it("does not POST consent for an already-granted authorization", async () => {
    fetchMock.mockReturnValueOnce(
      json(200, { redirect_url: "https://client.example/cb?code=xyz" }),
    );

    renderPage();

    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/consent");
  });

  it("refuses to render a consent screen it cannot attribute to a client", async () => {
    // A 2xx that is neither shape, e.g. an SPA index.html served for a wrong base URL.
    fetchMock.mockReturnValueOnce(json(200, { unexpected: true }));

    renderPage();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/wants to access/)).toBeNull();
  });

  it("surfaces an error when the authorization is expired or unknown", async () => {
    fetchMock.mockReturnValueOnce(
      json(404, { error: "oauth_authorization_not_found" }),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("loads once per id, because the GET consumes the authorization server-side", async () => {
    fetchMock.mockReturnValue(
      json(200, { authorization_id: "auth-123", client: { name: "Claude" } }),
    );

    const { rerender } = renderPage();
    await screen.findByText(/Claude wants to access/);
    rerender(
      <MantineProvider>
        <MemoryRouter>
          <OAuthConsent />
        </MemoryRouter>
      </MantineProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("asks the user to restart from the app rather than retry a dead authorization", async () => {
    fetchMock.mockReturnValueOnce(json(404, {}));

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/try again/i);
  });

  it("shows a missing-request error when authorization_id is absent", async () => {
    search = "";

    renderPage();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
