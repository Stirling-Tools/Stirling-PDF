import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TeamRedirect } from "@editor/routes/TeamRedirect";
import {
  resetPendingDestinationForTests,
  takePendingDestination,
} from "@editor/services/pendingDestination";

const auth = vi.hoisted(() => ({
  session: null as object | null,
  isAnonymous: false,
  loading: false,
}));

vi.mock("@editor/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("@editor/components/shared/LoadingFallback", () => ({
  LoadingFallback: () => <span>Loading</span>,
}));

function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderAt(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/team" element={<TeamRedirect />} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TeamRedirect", () => {
  beforeEach(() => {
    auth.session = null;
    auth.isAnonymous = false;
    auth.loading = false;
    window.localStorage.clear();
    resetPendingDestinationForTests();
  });

  it("sends a signed-in account straight to the Team checkout", async () => {
    auth.session = { user: { id: "u1" } };
    renderAt("/team");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/settings/billing?upgrade=team",
      ),
    );
  });

  it("sends a signed-out visitor to log in and back, keeping the campaign query", async () => {
    renderAt("/team?utm_campaign=nov");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/login?next=%2Fteam%3Futm_campaign%3Dnov",
      ),
    );
    expect(takePendingDestination()).toBe("/team?utm_campaign=nov");
  });

  it("treats a guest as signed out", async () => {
    auth.session = { user: { id: "guest" } };
    auth.isAnonymous = true;
    renderAt("/team");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/login?next=%2Fteam",
      ),
    );
  });

  it("waits for the session before deciding", () => {
    auth.loading = true;
    renderAt("/team");
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.queryByTestId("location")).toBeNull();
  });
});
