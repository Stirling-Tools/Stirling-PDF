import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { TeamWelcomeBanner } from "@editor/components/shared/TeamWelcomeBanner";
import {
  markTeamWelcome,
  resetTeamWelcomeForTests,
} from "@editor/billing/teamWelcome";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

let navigateTo: (path: string) => void = () => {};

function Shell() {
  navigateTo = useNavigate();
  return <output data-testid="location">{useLocation().pathname}</output>;
}

// The banner sits in a slot that outlives navigation, as AppLayout's does.
function renderApp(entry: string) {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[entry]}>
        <TeamWelcomeBanner />
        <Routes>
          <Route path="*" element={<Shell />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("TeamWelcomeBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTeamWelcomeForTests();
  });

  it("shows nothing without a recent Team purchase", () => {
    renderApp("/editor");
    expect(screen.queryByText("You're on Team.")).toBeNull();
  });

  it("appears when the buyer arrives at the editor after paying in billing", () => {
    renderApp("/settings/billing");
    expect(screen.queryByText("You're on Team.")).toBeNull();

    act(() => {
      markTeamWelcome();
      navigateTo("/editor");
    });

    expect(screen.getByText("You're on Team.")).toBeInTheDocument();
  });

  it("sends the buyer to the invite screen and does not come back", () => {
    markTeamWelcome();
    renderApp("/editor");

    fireEvent.click(screen.getByRole("button", { name: /Invite people/ }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/settings/people",
    );
    expect(screen.queryByText("You're on Team.")).toBeNull();
    act(() => navigateTo("/editor"));
    expect(screen.queryByText("You're on Team.")).toBeNull();
  });
});
