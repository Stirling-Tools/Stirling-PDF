import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getCurrentMode = vi.fn();
const serverShortcuts = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: () => null,
    getCurrentMode: () => getCurrentMode(),
    subscribeToModeChanges: () => () => {},
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
    serverShortcuts.ids = ["users", "server", "api-keys", "about"];
  });

  it("keeps the server pages when connected to a self-hosted server", async () => {
    const result = await idsIn("selfhosted");
    await waitFor(() =>
      expect(result.current.map((s) => s.id)).toEqual([
        "users",
        "server",
        "api-keys",
        "about",
      ]),
    );
  });

  it("drops the pages the cloud settings do not have", async () => {
    const result = await idsIn("saas");
    await waitFor(() =>
      expect(result.current.map((s) => s.id)).toEqual(["about"]),
    );
  });
});
