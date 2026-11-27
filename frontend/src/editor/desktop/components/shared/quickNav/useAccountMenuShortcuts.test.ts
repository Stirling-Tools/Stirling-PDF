import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getCurrentMode = vi.fn();
const serverShortcuts = vi.hoisted(() => ({ ids: [] as string[] }));
const auth = vi.hoisted(() => ({
  user: { id: "u1", orgOwner: false } as {
    id: string;
    orgOwner: boolean;
  } | null,
  isAnonymous: false,
  isAdmin: false,
  loading: false,
}));

vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: () => null,
    getCurrentMode: () => getCurrentMode(),
    subscribeToModeChanges: () => () => {},
  },
}));
vi.mock("@editor/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("@editor/services/authService", () => ({
  authService: {
    subscribeToAuth: (listener: (status: string) => void) => {
      listener(auth.user ? "authenticated" : "unauthenticated");
      return () => {};
    },
  },
}));
vi.mock(
  "@editor-proprietary/components/shared/quickNav/useAccountMenuShortcuts",
  () => ({
    useAccountMenuShortcuts: () =>
      serverShortcuts.ids.map((id) => ({
        id,
        label: id,
        icon: "settings",
        to: `/settings/${id}`,
      })),
  }),
);

const { useAccountMenuShortcuts } =
  await import("@editor/components/shared/quickNav/useAccountMenuShortcuts");

async function idsIn(mode: string) {
  getCurrentMode.mockResolvedValue(mode);
  const { result } = renderHook(() => useAccountMenuShortcuts());
  await waitFor(() => expect(getCurrentMode).toHaveBeenCalled());
  return result;
}

describe("desktop account menu shortcuts", () => {
  beforeEach(() => {
    getCurrentMode.mockReset();
    serverShortcuts.ids = ["users", "server", "api-keys"];
    auth.user = { id: "u1", orgOwner: false };
    auth.isAnonymous = false;
    auth.isAdmin = false;
  });

  it("keeps the server pages when connected to a self-hosted server", async () => {
    const result = await idsIn("selfhosted");
    await waitFor(() =>
      expect(result.current.map((s) => s.id)).toEqual([
        "users",
        "server",
        "api-keys",
      ]),
    );
  });

  it("adds the billing handoff for a self-hosted owner", async () => {
    auth.isAdmin = true;
    auth.user = { id: "u1", orgOwner: true };
    const result = await idsIn("selfhosted");
    await waitFor(() =>
      expect(result.current.map((s) => s.id)).toEqual([
        "users",
        "server",
        "api-keys",
        "billing",
      ]),
    );
  });

  it("offers the cloud team and billing pages in cloud mode", async () => {
    const result = await idsIn("saas");
    await waitFor(() =>
      expect(result.current.map((s) => s.id)).toEqual(["users", "billing"]),
    );
  });

  it("offers preferences and the connection page in local mode, even with a leftover session", async () => {
    const result = await idsIn("local");
    await waitFor(() =>
      expect(result.current.map((s) => s.id)).toEqual([
        "appearance",
        "hotkeys",
        "connection",
      ]),
    );
  });

  it("offers preferences and the connection page when signed out", async () => {
    auth.user = null;
    const result = await idsIn("selfhosted");
    await waitFor(() =>
      expect(result.current.map((s) => s.id)).toEqual([
        "appearance",
        "hotkeys",
        "connection",
      ]),
    );
  });
});
