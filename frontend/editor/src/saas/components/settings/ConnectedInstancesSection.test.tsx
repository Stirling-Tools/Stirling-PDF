import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import type { LinkedInstanceRow } from "@app/types/linkedInstance";

const state = vi.hoisted(() => ({
  get: vi.fn(),
  getKeys: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  owner: true,
  loading: false,
}));

// Key reads are routed apart so the instance-list tests can keep stubbing `get` wholesale.
vi.mock("@app/services/apiClient", () => ({
  default: {
    get: (url: string, options: unknown) =>
      url === "/api/v1/account-link/keys"
        ? state.getKeys(url, options)
        : state.get(url, options),
    post: state.post,
    patch: state.patch,
  },
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: { id: "owner-1" } }),
}));
vi.mock("@app/contexts/SaaSTeamContext", () => ({
  useSaaSTeam: () => ({
    currentTeam: { teamId: 7, name: "Northstar Studio" },
    isTeamLeader: state.owner,
    loading: state.loading,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
        String(values?.[key] ?? ""),
      ),
    i18n: { language: "en-US" },
  }),
}));

import ConnectedInstancesSection from "@app/components/settings/ConnectedInstancesSection";

const instance: LinkedInstanceRow = {
  instanceId: 42,
  deviceId: "server-42",
  name: "Old office server",
  createdAt: "2026-06-12T12:00:00Z",
  lastSeenAt: null,
  revoked: false,
};

function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <ConnectedInstancesSection />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("Connected instances", () => {
  beforeEach(() => {
    state.get.mockReset().mockResolvedValue({ data: [instance] });
    state.getKeys.mockReset().mockResolvedValue({ data: [] });
    state.post.mockReset().mockResolvedValue({});
    state.patch.mockReset().mockResolvedValue({});
    state.owner = true;
    state.loading = false;
  });

  it("lists instances without calling local connection status", async () => {
    mount();
    expect(await screen.findByText("Old office server")).toBeInTheDocument();
    expect(state.get).toHaveBeenCalledTimes(1);
    expect(state.get).toHaveBeenCalledWith(
      "/api/v1/account-link/instances",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("makes no instance requests for members or while ownership is loading", () => {
    state.owner = false;
    const { unmount } = mount();
    expect(
      screen.getByText("Only the team owner can manage connected instances."),
    ).toBeInTheDocument();
    expect(state.get).not.toHaveBeenCalled();
    unmount();
    state.owner = true;
    state.loading = true;
    mount();
    expect(state.get).not.toHaveBeenCalled();
    expect(state.getKeys).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Add a server with a key" }),
    ).not.toBeInTheDocument();
  });

  it("creates a link key and shows it once", async () => {
    state.post.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/v1/account-link/keys"
          ? {
              data: {
                keyId: "k1",
                key: "stlk_k1.secret",
                name: "Prod",
                expiresAt: "2026-10-23T12:00:00",
              },
            }
          : {},
      ),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a server with a key" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: " Prod " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await screen.findByText("stlk_k1.secret")).toBeInTheDocument();
    expect(state.post).toHaveBeenCalledWith(
      "/api/v1/account-link/keys",
      { name: "Prod" },
      { suppressErrorToast: true },
    );
    // The new key appears in the waiting list without a reload.
    await waitFor(() => expect(state.getKeys).toHaveBeenCalledTimes(2));
  });

  it("lists keys waiting for a server and revokes one", async () => {
    state.getKeys.mockResolvedValue({
      data: [
        {
          keyId: "k1",
          name: "Prod",
          createdAt: "2026-10-16T12:00:00",
          expiresAt: "2026-10-23T12:00:00",
        },
      ],
    });
    mount();
    expect(await screen.findByText("Prod")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));
    await waitFor(() =>
      expect(state.post).toHaveBeenCalledWith(
        "/api/v1/account-link/keys/k1/revoke",
        undefined,
        { suppressErrorToast: true },
      ),
    );
  });

  it("keeps waiting keys revocable when the instance list fails", async () => {
    state.get.mockRejectedValue(new Error("Unavailable"));
    state.getKeys.mockResolvedValue({
      data: [
        {
          keyId: "k1",
          name: "Prod",
          createdAt: null,
          expiresAt: "2026-10-23T12:00:00",
        },
      ],
    });
    mount();
    expect(await screen.findByText("Prod")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke key" })).toBeEnabled();
    expect(
      screen.getByText("Couldn’t load connected instances"),
    ).toBeInTheDocument();
  });

  it("says when the key list fails rather than showing it empty", async () => {
    state.get.mockResolvedValue({ data: [] });
    state.getKeys.mockRejectedValueOnce(new Error("Unavailable"));
    mount();
    expect(
      await screen.findByText("Couldn’t load link keys"),
    ).toBeInTheDocument();
    state.getKeys.mockResolvedValue({ data: [] });
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    await waitFor(() =>
      expect(
        screen.queryByText("Couldn’t load link keys"),
      ).not.toBeInTheDocument(),
    );
  });

  it("says when an instance was connected with a link key", async () => {
    state.get.mockResolvedValue({
      data: [{ ...instance, linkedWithKey: true }],
    });
    mount();
    expect(await screen.findByText("Connected with")).toBeInTheDocument();
    expect(screen.getByText("Link key")).toBeInTheDocument();
  });

  it("requires confirmation, permits cancellation, and hides removed connections", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove connection" }),
    );
    expect(state.post).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));
    state.get.mockResolvedValue({ data: [{ ...instance, revoked: true }] });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove connection",
      }),
    );
    await waitFor(() =>
      expect(state.post).toHaveBeenCalledWith(
        "/api/v1/account-link/instances/42/revoke",
        undefined,
        { suppressErrorToast: true },
      ),
    );
    expect(
      await screen.findByText("No connected instances"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Removed connections (1)"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("server-42")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove connection" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a failed removal actionable without marking the instance removed", async () => {
    state.post.mockRejectedValueOnce(new Error("Unavailable"));
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove connection" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove connection",
      }),
    );
    expect(
      await screen.findByText("Couldn’t remove the connection. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Old office server")).toBeInTheDocument();
    expect(
      screen.queryByText("Removed connections (1)"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove connection",
      }),
    ).toBeEnabled();
  });

  it("shows load failure separately from an empty list and allows retry", async () => {
    state.get.mockRejectedValueOnce(new Error("Unavailable"));
    mount();
    expect(
      await screen.findByText("Couldn’t load connected instances"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No connected instances"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Old office server")).toBeInTheDocument();
  });

  it("respects a server-side ownership denial", async () => {
    state.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
    });
    mount();
    expect(
      await screen.findByText(
        "Only the team owner can manage connected instances.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove connection" }),
    ).not.toBeInTheDocument();
  });

  it("leads with the name and hides the ID in Details", async () => {
    mount();
    expect(
      await screen.findByRole("heading", { name: "Old office server" }),
    ).toBeVisible();
    expect(screen.getByText("server-42")).not.toBeVisible();
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText("server-42")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));
    expect(
      screen.getByRole("dialog", {
        name: "Remove Old office server?",
      }),
    ).toBeInTheDocument();
  });

  it("edits the instance name", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Display name (optional)"), {
      target: { value: " London production " },
    });
    state.get.mockResolvedValue({
      data: [{ ...instance, name: "London production" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(state.patch).toHaveBeenCalledWith(
        "/api/v1/account-link/instances/42",
        { name: "London production" },
        { suppressErrorToast: true },
      ),
    );
    expect(await screen.findByText("London production")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "London production" }),
    ).toBeVisible();
  });

  it("retains a failed name edit for retry", async () => {
    state.patch.mockRejectedValueOnce(new Error("Unavailable"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Display name (optional)"), {
      target: { value: "London" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(
      await screen.findByText("Couldn’t save the name. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Display name (optional)")).toHaveValue(
      "London",
    );
    expect(screen.getByText("Old office server")).toBeVisible();
  });

  it("can clear an optional name", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Display name (optional)"), {
      target: { value: " " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(state.patch).toHaveBeenCalledWith(
        "/api/v1/account-link/instances/42",
        { name: null },
        { suppressErrorToast: true },
      ),
    );
  });

  it("keeps hostname names as plain labels", async () => {
    state.get.mockResolvedValue({
      data: [{ ...instance, name: "pdf.example.com" }],
    });
    mount();
    expect(await screen.findByText("pdf.example.com")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
