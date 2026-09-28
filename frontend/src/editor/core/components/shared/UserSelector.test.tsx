import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import UserSelector from "@app/components/shared/UserSelector";
import { fetchUsers } from "@app/api/users";
import { alert } from "@app/components/toast";

vi.mock("@app/api/users", () => ({ fetchUsers: vi.fn() }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
  }),
}));
const authState = vi.hoisted(() => ({
  user: { id: "1" } as { id: string } | null,
  isAnonymous: false,
}));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => authState }));

const mockFetch = vi.mocked(fetchUsers);

function renderSelector() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <TestQueryProvider>
          <UserSelector value={[]} onChange={() => {}} />
        </TestQueryProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("UserSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: "1" };
    authState.isAnonymous = false;
    mockFetch.mockResolvedValue([]);
  });

  it("does not list users for a guest", async () => {
    authState.user = { id: "guest" };
    authState.isAnonymous = true;

    renderSelector();

    expect(
      await screen.findByText(
        "Sign in to request signatures from other people.",
      ),
    ).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(vi.mocked(alert)).not.toHaveBeenCalled();
  });

  it("lists users for a signed-in account", async () => {
    renderSelector();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("No other users found.")).toBeTruthy();
  });
});
