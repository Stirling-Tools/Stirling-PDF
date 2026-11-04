import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoggedInState from "@editor/routes/login/LoggedInState";
import { resolveLandingPath } from "@editor/utils/loginLanding";
import {
  rememberPendingDestination,
  resetPendingDestinationForTests,
} from "@editor/services/pendingDestination";

vi.mock("@editor/utils/loginLanding", () => ({
  resolveLandingPath: vi.fn(),
}));

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("LoggedInState", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    window.localStorage.clear();
    resetPendingDestinationForTests();
  });

  it("returns to the destination remembered before an auth detour", async () => {
    rememberPendingDestination("/procurement");
    render(
      <MemoryRouter>
        <LoggedInState />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/procurement", {
        replace: true,
      });
    });
    expect(resolveLandingPath).not.toHaveBeenCalled();
  });

  it("navigates to the resolved landing path", async () => {
    vi.mocked(resolveLandingPath).mockResolvedValueOnce("/editor");
    render(
      <MemoryRouter>
        <LoggedInState />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/editor", { replace: true });
    });
  });

  it("falls back to / when landing resolution fails", async () => {
    vi.mocked(resolveLandingPath).mockRejectedValueOnce(new Error("down"));
    render(
      <MemoryRouter>
        <LoggedInState />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
