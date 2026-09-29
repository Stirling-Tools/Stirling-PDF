import { afterEach, describe, expect, it, vi } from "vitest";
import { retireLegacyFolderWorker } from "@app/services/retireLegacyFolderWorker";

const legacyScript = new URL("/sw-folder-retry.js", window.location.origin)
  .href;

function registration(
  active: string | null,
  waiting: string | null = null,
  installing: string | null = null,
) {
  return {
    active: active ? { scriptURL: active } : null,
    waiting: waiting ? { scriptURL: waiting } : null,
    installing: installing ? { scriptURL: installing } : null,
    unregister: vi.fn().mockResolvedValue(true),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("retireLegacyFolderWorker", () => {
  it("retires legacy workers in any lifecycle phase and leaves other registrations alone", async () => {
    const active = registration(legacyScript);
    const waiting = registration(null, legacyScript);
    const installing = registration(null, null, legacyScript);
    const unrelated = registration(
      new URL("/app-worker.js", window.location.origin).href,
    );
    const replacement = registration(legacyScript, unrelated.active?.scriptURL);
    const empty = registration(null);
    const getRegistrations = vi
      .fn()
      .mockResolvedValue([
        active,
        waiting,
        installing,
        unrelated,
        replacement,
        empty,
      ]);
    vi.stubGlobal("navigator", { serviceWorker: { getRegistrations } });

    await retireLegacyFolderWorker();

    for (const worker of [active, waiting, installing]) {
      expect(worker.unregister).toHaveBeenCalledOnce();
    }
    for (const worker of [unrelated, replacement, empty]) {
      expect(worker.unregister).not.toHaveBeenCalled();
    }
  });

  it("works when service workers are unavailable", async () => {
    vi.stubGlobal("navigator", {});
    await expect(retireLegacyFolderWorker()).resolves.toBeUndefined();
  });

  it("allows startup when browser permissions prevent reading registrations", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: vi.fn().mockRejectedValue(new Error("Access denied")),
      },
    });
    await expect(retireLegacyFolderWorker()).resolves.toBeUndefined();
  });

  it("allows startup when unregistering fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const legacy = registration(legacyScript);
    legacy.unregister.mockRejectedValue(new Error("Access denied"));
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([legacy]) },
    });
    await expect(retireLegacyFolderWorker()).resolves.toBeUndefined();
  });
});
