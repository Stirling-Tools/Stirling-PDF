import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { Team } from "@app/contexts/SaaSTeamContext";

const h = vi.hoisted(() => ({
  teams: [] as Team[],
  prefs: { loginLandingView: "processor" as "processor" | "editor" },
  update: vi.fn(),
}));

vi.mock("@app/contexts/SaaSTeamContext", () => ({
  useSaaSTeam: () => ({ teams: h.teams }),
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: h.prefs, updatePreference: h.update }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { SaasLoginLandingSetting } from "@app/components/shared/config/SaasLoginLandingSetting";

function team(overrides: Partial<Team>): Team {
  return {
    teamId: 1,
    name: "Team",
    teamType: "STANDARD",
    isPersonal: false,
    memberCount: 1,
    seatCount: 1,
    seatsUsed: 1,
    maxSeats: 1,
    isLeader: false,
    ...overrides,
  } as Team;
}

function renderSetting() {
  return render(
    <MantineProvider>
      <SaasLoginLandingSetting />
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_INCLUDE_PORTAL", "true");
  vi.stubEnv("VITE_LOGIN_LANDING_MODE", "dynamic");
  h.teams = [];
  h.prefs = { loginLandingView: "processor" };
  h.update.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("SaasLoginLandingSetting", () => {
  it("shows the control for a real team lead", () => {
    h.teams = [team({ isLeader: true, isPersonal: false })];
    renderSetting();
    expect(screen.getByText("After signing in")).toBeInTheDocument();
    expect(screen.getByText("Processor")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("renders nothing for a member", () => {
    h.teams = [team({ isLeader: false, isPersonal: false })];
    renderSetting();
    expect(screen.queryByText("After signing in")).not.toBeInTheDocument();
  });

  it("renders nothing for a solo (personal-team) user", () => {
    h.teams = [team({ isLeader: true, isPersonal: true })];
    renderSetting();
    expect(screen.queryByText("After signing in")).not.toBeInTheDocument();
  });

  it("renders nothing in editor mode (soft release)", () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "editor");
    h.teams = [team({ isLeader: true, isPersonal: false })];
    renderSetting();
    expect(screen.queryByText("After signing in")).not.toBeInTheDocument();
  });

  it("renders nothing when the portal is not bundled", () => {
    vi.stubEnv("VITE_INCLUDE_PORTAL", "");
    vi.stubEnv("DEV", false);
    h.teams = [team({ isLeader: true, isPersonal: false })];
    renderSetting();
    expect(screen.queryByText("After signing in")).not.toBeInTheDocument();
  });
});
