import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

const h = vi.hoisted(() => ({
  prefs: { loginLandingView: "processor" as "processor" | "editor" },
  update: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: h.prefs, updatePreference: h.update }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { LoginLandingSetting } from "@app/components/shared/config/LoginLandingSetting";

function httpError(status: number) {
  return Object.assign(new Error("http"), { response: { status } });
}

// Self-hosted admin (portalAccess true, no /team/my) → eligible.
function eligibleBackend() {
  h.get.mockImplementation((url: string) => {
    if (url === "/api/v1/auth/me") {
      return Promise.resolve({
        data: { user: { role: "ROLE_ADMIN", portalAccess: true } },
      });
    }
    return Promise.reject(httpError(404));
  });
}

// Self-hosted member (no portalAccess) → not eligible.
function memberBackend() {
  h.get.mockImplementation((url: string) => {
    if (url === "/api/v1/auth/me") {
      return Promise.resolve({
        data: { user: { role: "USER", portalAccess: false } },
      });
    }
    return Promise.reject(httpError(404));
  });
}

function renderSetting() {
  return render(
    <MantineProvider>
      <LoginLandingSetting />
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_INCLUDE_PORTAL", "true");
  vi.stubEnv("VITE_LOGIN_LANDING_MODE", "dynamic");
  h.prefs = { loginLandingView: "processor" };
  h.update.mockReset();
  h.get.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("LoginLandingSetting", () => {
  it("shows the control for a processor user", async () => {
    eligibleBackend();
    renderSetting();
    expect(await screen.findByText("After signing in")).toBeInTheDocument();
    expect(screen.getByText("Processor")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("renders nothing for a member", async () => {
    memberBackend();
    renderSetting();
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByText("After signing in")).not.toBeInTheDocument();
  });

  it("renders nothing in editor mode (soft release)", () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "editor");
    eligibleBackend();
    renderSetting();
    expect(screen.queryByText("After signing in")).not.toBeInTheDocument();
  });

  it("renders nothing when the portal is not bundled", () => {
    vi.stubEnv("VITE_INCLUDE_PORTAL", "");
    vi.stubEnv("DEV", false);
    eligibleBackend();
    renderSetting();
    expect(screen.queryByText("After signing in")).not.toBeInTheDocument();
  });
});
