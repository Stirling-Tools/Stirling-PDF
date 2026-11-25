import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { TeamWelcomeBanner } from "@editor/components/shared/TeamWelcomeBanner";
import { TEAM_WELCOME_STATE } from "@editor/billing/teamWelcome";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const TITLE = "Your Team plan is active.";

let navigateTo: ReturnType<typeof useNavigate> = () => {};

function Shell() {
  navigateTo = useNavigate();
  const { pathname, state } = useLocation();
  return (
    <>
      <output data-testid="location">{pathname}</output>
      <output data-testid="state">{JSON.stringify(state)}</output>
    </>
  );
}

// The banner sits in a slot that outlives navigation, as AppLayout's does.
function renderApp(entry: string) {
  render(
    <StrictMode>
      <MantineProvider>
        <MemoryRouter initialEntries={[entry]}>
          <TeamWelcomeBanner />
          <Routes>
            <Route path="*" element={<Shell />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </StrictMode>,
  );
}

const arriveFromPurchase = () =>
  act(() => {
    navigateTo("/editor", { state: TEAM_WELCOME_STATE });
  });

describe("TeamWelcomeBanner", () => {
  it("shows nothing on an ordinary visit", () => {
    renderApp("/editor");
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("appears when billing sends the buyer to the editor, and clears the state", () => {
    renderApp("/settings/billing");
    expect(screen.queryByText(TITLE)).toBeNull();

    arriveFromPurchase();

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/editor");
    expect(screen.getByTestId("state")).toHaveTextContent("null");
  });

  it("sends the buyer to the invite screen and does not come back", () => {
    renderApp("/settings/billing");
    arriveFromPurchase();

    fireEvent.click(screen.getByRole("button", { name: /Invite people/ }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/settings/people",
    );
    expect(screen.queryByText(TITLE)).toBeNull();
    act(() => {
      navigateTo("/editor");
    });
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
