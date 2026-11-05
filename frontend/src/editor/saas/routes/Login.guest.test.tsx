import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { TestQueryProvider } from "@editor/tests/utils/TestQueryProvider";
import Login from "@editor/routes/Login";

const auth = vi.hoisted(() => ({
  session: {} as object | null,
  isAnonymous: true,
}));

vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({
    session: auth.session,
    isAnonymous: auth.isAnonymous,
    loading: false,
    refreshSession: vi.fn(),
  }),
}));
const { signInAnonymously } = vi.hoisted(() => ({
  signInAnonymously: vi.fn(),
}));
vi.mock("@editor/auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  },
  signInAnonymously,
}));
vi.mock("@editor/hooks/useDocumentMeta", () => ({ useDocumentMeta: vi.fn() }));
const destination = vi.hoisted(() => ({
  rememberPendingDestination: vi.fn(),
  clearPendingDestination: vi.fn(),
  takePendingDestination: vi.fn(() => null),
}));
vi.mock("@editor/services/pendingDestination", () => destination);

function mount(entry: string) {
  window.history.replaceState(null, "", entry);
  render(
    <MantineProvider>
      <TestQueryProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/enterprise" element={<div>Enterprise page</div>} />
          </Routes>
        </MemoryRouter>
      </TestQueryProvider>
    </MantineProvider>,
  );
}

describe("SaaS login with a guest session", () => {
  beforeEach(() => {
    auth.session = {};
    auth.isAnonymous = true;
    vi.clearAllMocks();
  });

  it("shows a guest the sign-in form instead of sending them back to `next`", () => {
    mount("/login?next=%2Fenterprise");
    expect(screen.queryByText("Enterprise page")).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("sends a signed-in account straight on to `next`", () => {
    auth.isAnonymous = false;
    mount("/login?next=%2Fenterprise");
    expect(screen.getByText("Enterprise page")).toBeInTheDocument();
  });

  it("lets a guest skip on to `next` as the same guest, without a new guest session", () => {
    mount("/login?next=%2Fenterprise");
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(screen.getByText("Enterprise page")).toBeInTheDocument();
  });

  it("leaves no remembered destination behind once it has sent them on", () => {
    auth.isAnonymous = false;
    mount("/login?next=%2Fenterprise");
    expect(destination.clearPendingDestination).toHaveBeenCalled();
    expect(destination.rememberPendingDestination).not.toHaveBeenCalled();
  });
});
