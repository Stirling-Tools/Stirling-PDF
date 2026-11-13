import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { TestQueryProvider } from "@editor/tests/utils/TestQueryProvider";
import Signup from "@editor/routes/Signup";

vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({
    session: null,
    isAnonymous: false,
    loading: false,
    refreshSession: vi.fn(),
  }),
}));
vi.mock("@editor/auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  },
  signInAnonymously: vi.fn(),
}));
vi.mock("@editor/hooks/useDocumentMeta", () => ({ useDocumentMeta: vi.fn() }));
vi.mock("@editor/services/pendingDestination", () => ({
  rememberPendingDestination: vi.fn(),
}));

function mount(entry: string) {
  render(
    <MantineProvider>
      <TestQueryProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/signup" element={<Signup />} />
          </Routes>
        </MemoryRouter>
      </TestQueryProvider>
    </MantineProvider>,
  );
}

describe("SaaS sign-up for the Team checkout", () => {
  it("tells a visitor heading to /team that this sign-up is for buying Team", () => {
    mount("/signup?next=%2Fteam");
    expect(
      screen.getByRole("heading", { name: "signup.buyTeamTitle" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /skip/i }),
    ).not.toBeInTheDocument();
  });

  it("gives a plain sign-up no Team heading and keeps skip", () => {
    mount("/signup");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
  });
});
