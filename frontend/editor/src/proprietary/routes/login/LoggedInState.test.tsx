import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoggedInState from "@app/routes/login/LoggedInState";
import { resolveLandingPath } from "@app/utils/loginLanding";

vi.mock("@app/utils/loginLanding", () => ({
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
