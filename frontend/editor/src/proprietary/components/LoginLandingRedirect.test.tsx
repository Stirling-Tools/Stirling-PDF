import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

// Mutable holders driven per-test; read at call time by the mocks below.
const h = vi.hoisted(() => ({
  auth: { session: null as unknown, isAnonymous: false },
  prefs: { loginLandingView: "processor" as "processor" | "editor" },
  get: vi.fn(),
}));

vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => h.auth }));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: h.prefs, updatePreference: vi.fn() }),
}));

import { LoginLandingRedirect } from "@app/components/LoginLandingRedirect";
import {
  hasLoginLandingPending,
  markLoginLandingPending,
} from "@app/utils/loginLanding";

function httpError(status: number) {
  return Object.assign(new Error("http"), { response: { status } });
}

// Configure the two backend endpoints. teamMy === "404" simulates self-hosted.
function backend(opts: {
  role: string;
  portalAccess: boolean;
  teamMy: unknown[] | "404";
}) {
  h.get.mockImplementation((url: string) => {
    if (url === "/api/v1/auth/me") {
      return Promise.resolve({
        data: { user: { role: opts.role, portalAccess: opts.portalAccess } },
      });
    }
    if (url === "/api/v1/team/my") {
      return opts.teamMy === "404"
        ? Promise.reject(httpError(404))
        : Promise.resolve({ data: opts.teamMy });
    }
    return Promise.resolve({ data: {} });
  });
}

function LocationProbe() {
  return <div data-testid="pathname">{useLocation().pathname}</div>;
}

function renderAt(pathname = "/", strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[pathname]}>
      <LoginLandingRedirect />
      <LocationProbe />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const SIGNED_IN = { session: { user: { id: "u1" } }, isAnonymous: false };

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubEnv("VITE_INCLUDE_PORTAL", "true");
  vi.stubEnv("VITE_LOGIN_LANDING_MODE", "dynamic");
  h.auth = { ...SIGNED_IN };
  h.prefs = { loginLandingView: "processor" };
  h.get.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("LoginLandingRedirect", () => {
  it("self-hosted admin (no /team/my, portalAccess) → processor", async () => {
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    markLoginLandingPending();
    renderAt("/");
    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe("/processor"),
    );
    expect(hasLoginLandingPending()).toBe(false);
  });

  it("self-hosted member (no /team/my, no portalAccess) → editor", async () => {
    backend({ role: "USER", portalAccess: false, teamMy: "404" });
    markLoginLandingPending();
    renderAt("/");
    await waitFor(() => expect(hasLoginLandingPending()).toBe(false));
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("saas real team lead → processor", async () => {
    backend({
      role: "USER",
      portalAccess: true,
      teamMy: [{ isLeader: true, isPersonal: false }],
    });
    markLoginLandingPending();
    renderAt("/");
    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe("/processor"),
    );
  });

  it("saas member → editor", async () => {
    backend({
      role: "USER",
      portalAccess: true,
      teamMy: [
        { isLeader: true, isPersonal: true },
        { isLeader: false, isPersonal: false },
      ],
    });
    markLoginLandingPending();
    renderAt("/");
    await waitFor(() => expect(hasLoginLandingPending()).toBe(false));
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("still redirects under StrictMode double-invoke", async () => {
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    markLoginLandingPending();
    renderAt("/", true);
    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe("/processor"),
    );
  });

  it("does not fetch when a user opted into the editor", async () => {
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    h.prefs = { loginLandingView: "editor" };
    markLoginLandingPending();
    renderAt("/");
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
    expect(hasLoginLandingPending()).toBe(false);
  });

  it("does nothing in editor mode (soft release)", async () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "editor");
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    markLoginLandingPending();
    renderAt("/");
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("does nothing without the fresh-login flag", async () => {
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    renderAt("/");
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("waits on auth routes and keeps the flag", async () => {
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    markLoginLandingPending();
    renderAt("/login");
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(hasLoginLandingPending()).toBe(true);
  });

  it("ignores anonymous sessions", async () => {
    h.auth = { session: { user: { id: "anon" } }, isAnonymous: true };
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    markLoginLandingPending();
    renderAt("/");
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });
});
