import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

// Mutable holders driven per-test; read at call time by the mocks below.
const h = vi.hoisted(() => ({
  landingView: "processor" as "processor" | "editor",
  get: vi.fn(),
}));

vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));
vi.mock("@app/services/preferencesService", () => ({
  preferencesService: { getPreference: () => h.landingView },
}));

import { RootGate } from "@app/routes/RootGate";

function httpError(status: number) {
  return { isAxiosError: true, message: "http", response: { status } };
}

// Configure the backend endpoints the decision reads. teamMy === "404"
// simulates self-hosted; processorEnabled defaults to on, as a server ships.
function backend(opts: {
  role: string;
  portalAccess: boolean;
  teamMy: unknown[] | "404";
  processorEnabled?: boolean;
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
    if (url === "/api/v1/config/app-config") {
      return Promise.resolve({
        data: { processorEnabled: opts.processorEnabled ?? true },
      });
    }
    return Promise.resolve({ data: {} });
  });
}

function LocationProbe() {
  return <div data-testid="pathname">{useLocation().pathname}</div>;
}

/** Stands in for the whole app tree, so "did the app mount?" is observable. */
function TheApp() {
  return <div data-testid="app">the app</div>;
}

// Mirrors App.tsx: the processor is a sibling top-level route, so RootGate (the
// catch-all element) is not even rendered once the redirect lands.
function renderAt(pathname: string, strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="/processor/*"
          element={<div data-testid="processor">the processor</div>}
        />
        <Route
          path="*"
          element={
            <RootGate>
              <TheApp />
            </RootGate>
          }
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const at = () => screen.getByTestId("pathname").textContent;
const appMounted = () => screen.queryByTestId("app") !== null;

describe("RootGate", () => {
  beforeEach(() => {
    h.landingView = "processor";
    h.get.mockReset();
    // The portal only exists in some builds; the decision is a no-op without it.
    vi.stubEnv("VITE_INCLUDE_PORTAL", "true");
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "dynamic");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("renders the app untouched on every path but /", async () => {
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    renderAt("/compress");
    expect(appMounted()).toBe(true);
    expect(at()).toBe("/compress");
    expect(h.get).not.toHaveBeenCalled();
  });

  it("sends a processor user to the processor", async () => {
    backend({ role: "USER", portalAccess: true, teamMy: "404" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/processor"));
  });

  it("sends everyone else to the editor", async () => {
    backend({ role: "USER", portalAccess: false, teamMy: "404" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/editor"));
  });

  it("never boots the app on the way to the processor", async () => {
    backend({ role: "USER", portalAccess: true, teamMy: "404" });
    renderAt("/");
    expect(appMounted()).toBe(false); // deciding
    await waitFor(() => expect(at()).toBe("/processor"));
    expect(appMounted()).toBe(false);
    expect(screen.getByTestId("processor")).toBeTruthy();
  });

  it("leaves a signed-out visitor on / and lets the app handle it", async () => {
    h.get.mockRejectedValue(httpError(401));
    renderAt("/");
    await waitFor(() => expect(appMounted()).toBe(true));
    expect(at()).toBe("/");
  });

  it("survives StrictMode's double-invoke", async () => {
    backend({ role: "USER", portalAccess: true, teamMy: "404" });
    renderAt("/", true);
    await waitFor(() => expect(at()).toBe("/processor"));
  });

  it("honours the per-user editor override without a lookup", async () => {
    h.landingView = "editor";
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/editor"));
    expect(h.get).not.toHaveBeenCalled();
  });

  it("routes everyone to the editor when the soft-release flag is off", async () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "editor");
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/editor"));
    expect(h.get).not.toHaveBeenCalled();
  });

  it("routes to the editor when the server has the processor off", async () => {
    // The build ships the portal, and the user would qualify for it - but this
    // server doesn't mount the route, so landing there would bounce.
    backend({
      role: "ROLE_ADMIN",
      portalAccess: true,
      teamMy: "404",
      processorEnabled: false,
    });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/editor"));
  });

  it("still routes to the processor when app-config is unreachable", async () => {
    // Unknown is not off: a blip must not silently take the portal away.
    h.get.mockImplementation((url: string) => {
      if (url === "/api/v1/auth/me") {
        return Promise.resolve({
          data: { user: { role: "ROLE_ADMIN", portalAccess: true } },
        });
      }
      if (url === "/api/v1/config/app-config")
        return Promise.reject(httpError(500));
      return Promise.reject(httpError(404));
    });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/processor"));
  });

  it("routes to the editor when this build ships no processor", async () => {
    vi.stubEnv("VITE_INCLUDE_PORTAL", "false");
    vi.stubEnv("DEV", false);
    backend({ role: "ROLE_ADMIN", portalAccess: true, teamMy: "404" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/editor"));
    expect(h.get).not.toHaveBeenCalled();
  });
});
