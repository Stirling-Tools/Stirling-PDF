import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));

import { RootGate } from "@app/routes/RootGate";

function httpError(status: number) {
  return { isAxiosError: true, message: "http", response: { status } };
}

function backend(opts: {
  portalAccess: boolean;
  loginLandingView?: "processor" | "editor";
}) {
  h.get.mockImplementation((url: string) =>
    url === "/api/v1/auth/me"
      ? Promise.resolve({
          data: {
            user: {
              portalAccess: opts.portalAccess,
              loginLandingView: opts.loginLandingView,
            },
          },
        })
      : Promise.resolve({ data: {} }),
  );
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
    h.get.mockReset();
    // The portal only exists in some builds; the decision is a no-op without it.
    vi.stubEnv("VITE_INCLUDE_PORTAL", "true");
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "dynamic");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("renders the app untouched on every path but /", async () => {
    backend({ portalAccess: true, loginLandingView: "processor" });
    renderAt("/compress");
    expect(appMounted()).toBe(true);
    expect(at()).toBe("/compress");
    expect(h.get).not.toHaveBeenCalled();
  });

  it("sends an opted-in user to the processor", async () => {
    backend({ portalAccess: true, loginLandingView: "processor" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/processor"));
  });

  it("sends everyone without the opt-in to the editor", async () => {
    backend({ portalAccess: true });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/editor"));
  });

  it("never boots the app on the way to the processor", async () => {
    backend({ portalAccess: true, loginLandingView: "processor" });
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
    backend({ portalAccess: true, loginLandingView: "processor" });
    renderAt("/", true);
    await waitFor(() => expect(at()).toBe("/processor"));
  });

  it("routes everyone to the editor when the kill switch is on", async () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "editor");
    backend({ portalAccess: true, loginLandingView: "processor" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/editor"));
    expect(h.get).not.toHaveBeenCalled();
  });

  it("routes to the editor when this build ships no processor", async () => {
    vi.stubEnv("VITE_INCLUDE_PORTAL", "false");
    vi.stubEnv("DEV", false);
    backend({ portalAccess: true, loginLandingView: "processor" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/editor"));
    expect(h.get).not.toHaveBeenCalled();
  });
});
