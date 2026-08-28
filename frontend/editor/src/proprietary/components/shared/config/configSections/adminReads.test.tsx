import { describe, it, expect, vi, beforeEach } from "vitest";
import { type ReactNode } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baseQueryOptions } from "@app/query/queryClient";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import TeamsSection from "@app/components/shared/config/configSections/TeamsSection";
import PeopleSection from "@app/components/shared/config/configSections/PeopleSection";
import {
  teamService,
  type Team,
  type TeamDetailsUIResponse,
} from "@app/services/teamService";
import {
  userManagementService,
  type AdminSettingsData,
} from "@app/services/userManagementService";

vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: { username: "admin" } }),
}));
vi.mock("@app/contexts/LicenseContext", () => ({
  useLicense: () => ({ licenseInfo: null }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, f?: unknown) => (typeof f === "string" ? f : k),
  }),
  Trans: ({ children }: { children?: ReactNode }) => children ?? null,
}));

const calls = { getTeams: 0, getUsers: 0, getTeamDetails: 0 };
let client: QueryClient;

const TEAMS: Team[] = [
  { id: 1, name: "Engineering", userCount: 8 },
  { id: 2, name: "Marketing", userCount: 3 },
];

const ADMIN_DATA: AdminSettingsData = {
  users: [
    {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      roleName: "ROLE_ADMIN",
      rolesAsString: "ROLE_ADMIN",
      authenticationType: "password",
    },
  ],
  userSessions: {},
  userLastRequest: {},
  totalUsers: 1,
  activeUsers: 1,
  disabledUsers: 0,
  maxAllowedUsers: 10,
  availableSlots: 9,
  grandfatheredUserCount: 0,
  licenseMaxUsers: 10,
  premiumEnabled: true,
  mailEnabled: false,
  userSettings: {},
  lockedUsers: [],
};

const TEAM_DETAILS: TeamDetailsUIResponse = {
  team: { id: 1, name: "Engineering" },
  teamUsers: [
    {
      id: 1,
      username: "alice",
      enabled: true,
      roleName: "ROLE_ADMIN",
      rolesAsString: "ROLE_ADMIN",
      authenticationType: "password",
    },
  ],
  availableUsers: [],
  userLastRequest: {},
};

let teamsPayload: Team[] = TEAMS;

function stubServices() {
  teamService.getTeams = async () => {
    calls.getTeams++;
    return teamsPayload;
  };
  teamService.getTeamDetails = async () => {
    calls.getTeamDetails++;
    return TEAM_DETAILS;
  };
  userManagementService.getUsers = async () => {
    calls.getUsers++;
    return ADMIN_DATA;
  };
}

function Harness({ children }: { children: ReactNode }) {
  return (
    <MantineProvider>
      <QueryClientProvider client={client}>
        <AppConfigProvider
          autoFetch={false}
          bootstrapMode="non-blocking"
          initialConfig={{ enableLogin: true }}
        >
          {children}
        </AppConfigProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}

function totalRequests() {
  return calls.getTeams + calls.getUsers + calls.getTeamDetails;
}

describe("admin directory reads", () => {
  beforeEach(() => {
    calls.getTeams = 0;
    calls.getUsers = 0;
    calls.getTeamDetails = 0;
    teamsPayload = TEAMS;
    // Mirrors the app client, so the stale window under test is the real one.
    client = new QueryClient({
      defaultOptions: { queries: { ...baseQueryOptions, retry: false } },
    });
    stubServices();
  });

  it("costs three requests for teams -> details -> back -> people", async () => {
    const user = userEvent.setup();
    const teamsView = render(
      <Harness>
        <TeamsSection />
      </Harness>,
    );
    await screen.findByText("Engineering");

    await user.click(screen.getByText("Engineering"));
    await waitFor(() => expect(calls.getTeamDetails).toBe(1));
    await act(async () => {});

    await user.click(screen.getByRole("button", { name: /back/i }));
    await screen.findByText("Marketing");

    // Config sections are swapped, not stacked: changing tab unmounts one.
    teamsView.unmount();
    render(
      <Harness>
        <PeopleSection />
      </Harness>,
    );
    await waitFor(() => expect(calls.getUsers).toBe(1));
    await act(async () => {});

    // One fetch per distinct resource. The team list is read by all three
    // views and the roster by two, so both were previously fetched per view.
    expect(calls.getTeams).toBe(1);
    expect(calls.getUsers).toBe(1);
    expect(calls.getTeamDetails).toBe(1);
    expect(totalRequests()).toBe(3);
  });

  it("shows the team list a write produced, without a manual refresh call", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <TeamsSection />
      </Harness>,
    );
    await screen.findByText("Engineering");

    // The write lands server-side; only an invalidation brings it back.
    teamService.createTeam = async () => {
      teamsPayload = [...TEAMS, { id: 3, name: "Platform", userCount: 0 }];
    };

    await user.click(
      screen.getByRole("button", { name: "workspace.teams.createNewTeam" }),
    );
    await user.type(
      await screen.findByPlaceholderText(
        "workspace.teams.createTeam.teamNamePlaceholder",
      ),
      "Platform",
    );
    await user.click(
      screen.getByRole("button", {
        name: "workspace.teams.createTeam.submit",
      }),
    );

    await screen.findByText("Platform");
  });

  it("makes no request and shows example data when login is disabled", async () => {
    render(
      <MantineProvider>
        <QueryClientProvider client={client}>
          <AppConfigProvider
            autoFetch={false}
            bootstrapMode="non-blocking"
            initialConfig={{ enableLogin: false }}
          >
            <TeamsSection />
          </AppConfigProvider>
        </QueryClientProvider>
      </MantineProvider>,
    );

    // Example rows, not a spinner: the endpoints are not callable.
    await screen.findByText("Internal");
    expect(calls.getTeams).toBe(0);
  });
});
