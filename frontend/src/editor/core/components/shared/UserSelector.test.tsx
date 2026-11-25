import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { TestQueryProvider } from "@editor/tests/utils/TestQueryProvider";
import UserSelector from "@editor/components/shared/UserSelector";
import { fetchUsers } from "@editor/api/users";
import { alert } from "@editor/components/toast";

vi.mock("@editor/api/users", () => ({ fetchUsers: vi.fn() }));
vi.mock("@editor/components/toast", () => ({ alert: vi.fn() }));
vi.mock("react-i18next", () => {
  const t = (_k: string, fallback?: string) => fallback ?? _k;
  return { useTranslation: () => ({ t }) };
});
const authState = vi.hoisted(() => ({
  user: { id: "1" } as { id: string } | null,
  isAnonymous: false,
  loading: false,
}));
vi.mock("@editor/auth/UseSession", () => ({ useAuth: () => authState }));

const mockFetch = vi.mocked(fetchUsers);

function selector() {
  return (
    <MantineProvider>
      <MemoryRouter>
        <TestQueryProvider>
          <UserSelector value={[]} onChange={() => {}} />
        </TestQueryProvider>
      </MemoryRouter>
    </MantineProvider>
  );
}

function renderSelector() {
  const result = render(selector());
  return { ...result, rerenderSelector: () => result.rerender(selector()) };
}

describe("UserSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: "1" };
    authState.isAnonymous = false;
    authState.loading = false;
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
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(vi.mocked(alert)).not.toHaveBeenCalled();
  });

  it("lists users for a signed-in account", async () => {
    renderSelector();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("No other users found."),
    ).toBeInTheDocument();
  });

  it("waits for authentication before resolving to a guest", async () => {
    authState.user = null;
    authState.loading = true;
    const { rerenderSelector } = renderSelector();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByText("No other users found.")).not.toBeInTheDocument();

    authState.user = { id: "guest" };
    authState.isAnonymous = true;
    authState.loading = false;
    rerenderSelector();

    expect(
      await screen.findByText(
        "Sign in to request signatures from other people.",
      ),
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it("loads users once authentication resolves to a signed-in account", async () => {
    authState.user = null;
    authState.loading = true;
    const { rerenderSelector } = renderSelector();
    expect(mockFetch).not.toHaveBeenCalled();

    authState.user = { id: "1" };
    authState.loading = false;
    rerenderSelector();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("No other users found."),
    ).toBeInTheDocument();
  });

  it("reports a signed-in query failure once and hides it for a guest", async () => {
    mockFetch.mockRejectedValue(new Error("Unable to load users"));
    const { rerenderSelector } = renderSelector();

    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert).toHaveBeenCalledWith({
      alertType: "error",
      title: "common.error",
      body: "Failed to load users",
    });

    authState.user = { id: "guest" };
    authState.isAnonymous = true;
    rerenderSelector();

    expect(
      await screen.findByText(
        "Sign in to request signatures from other people.",
      ),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
