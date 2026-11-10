import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Landing only decides *which* screen to render; the screens themselves are
// heavy and unrelated, so each is a labelled stub. The real i18next instance
// also initialises every locale bundle, and Landing needs only a t().
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The ui barrel pulls the icon set and Mantine with it; Landing only needs a
// button, and the test is about routing.
vi.mock("@editor/ui/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@editor/components/layout/AppRoot", () => ({
  AppRoot: () => <div data-testid="app-root">the app</div>,
}));

vi.mock("@editor/routes/authShared/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));

vi.mock("@editor/routes/login/LoginHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const probe = vi.fn().mockResolvedValue({ status: "up", loginDisabled: false });
// One stable object: a fresh one per call would re-run Landing's effects on
// every render.
const probeState = {
  status: "up" as const,
  loginDisabled: false,
  loading: false,
  probe,
};

vi.mock("@editor/hooks/useBackendProbe", () => ({
  useBackendProbe: () => probeState,
}));

const h = vi.hoisted<{
  auth: { session: unknown; loading: boolean };
  config: Record<string, unknown> | null;
}>(() => ({ auth: { session: null, loading: false }, config: null }));

vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => h.auth,
}));

const refetch = vi.fn().mockResolvedValue(undefined);

vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: h.config,
    loading: false,
    error: null,
    refetch,
    configFromServer: true,
  }),
}));

vi.mock("@editor/contexts/QuickNavHostContext", () => ({
  useSuppressQuickNavRail: vi.fn(),
}));

import Landing from "@editor/routes/Landing";

/**
 * Routed, not rendered bare: Landing redirects to /login when guests are shut
 * out, and a bare mount would answer that redirect with Landing again, growing
 * the `from` query until the worker dies.
 */
function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page" />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.auth = { session: null, loading: false };
});

describe("Landing — guest mode", () => {
  it("keeps a guest in the app instead of sending them to the login wall", () => {
    // security.enableLogin + security.allowAnonymousAccess: the tools are the
    // whole point of the visit, so nothing bounces.
    h.config = { enableLogin: true, allowAnonymousAccess: true };
    renderLanding();
    expect(screen.getByTestId("app-root")).toBeTruthy();
  });

  it("still bounces a signed-out visitor when guests are not admitted", () => {
    h.config = { enableLogin: true, allowAnonymousAccess: false };
    renderLanding();
    expect(screen.queryByTestId("app-root")).toBeNull();
    expect(screen.getByTestId("login-page")).toBeTruthy();
  });

  it("keeps the app for an install with login switched off", () => {
    h.config = { enableLogin: false };
    renderLanding();
    expect(screen.getByTestId("app-root")).toBeTruthy();
  });
});
