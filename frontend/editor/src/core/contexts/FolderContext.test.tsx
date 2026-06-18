import React from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { FolderProvider, useFolders } from "@app/contexts/FolderContext";
import { createFolderId, FolderId, FolderRecord } from "@app/types/folder";
import { expectConsole } from "@app/tests/failOnConsole";

/**
 * Regression test for the sync-banner 4xx gating fix in commit c38b646c5.
 * Pre-fix, `pullFromServer.catch` unconditionally called `setError(...)`,
 * surfacing a "Folder sync failed: ..." banner for 401/403 responses
 * (storage disabled, user not signed in) - noise the user can't act on
 * from inside the file manager.
 *
 * Post-fix, the banner only appears when `status === undefined || status >= 500`
 * (server-side outage or genuine network failure - both retryable).
 *
 * The gate's `status` extraction relies on axios's error shape
 * (`err.response.status`). A future HTTP-client swap (e.g. to fetch where
 * the shape is `err.status`) would silently make `status` always undefined
 * and re-enable the noisy banner for every 4xx - exactly the regression
 * this test pins down.
 */

// Mock the services FolderContext depends on. The real implementations
// require a running backend (folderSyncService) and a populated IDB
// (folderStorage). Both are out of scope for testing the error gate.
const mockList = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock("@app/services/folderSyncService", () => ({
  folderSyncService: {
    list: () => mockList(),
    create: vi.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// FolderProvider only pulls from the server for a confirmed, non-anonymous
// user (guests have no cloud storage). Mock useAuth as a signed-in user so the
// pull runs; the guest-skip path is covered by its own test below.
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    user: { id: "test-user", is_anonymous: false } as Record<
      string,
      unknown
    > | null,
    isAnonymous: false,
  },
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({
    user: mockAuth.user,
    isAnonymous: mockAuth.isAnonymous,
    session: null,
    displayName: null,
    loading: false,
    error: null,
    signOut: vi.fn(),
    refreshSession: vi.fn(),
  }),
}));

// Stateful IDB mock - the revision-driven refresh re-reads getAllFolders
// after every state change, so a stateless [] mock would clobber pull results.
const { mockIdb } = vi.hoisted(() => ({
  mockIdb: { folders: [] as { id: string }[] },
}));
vi.mock("@app/services/folderStorage", () => ({
  folderStorage: {
    getAllFolders: vi.fn(() => Promise.resolve([...mockIdb.folders])),
    replaceAll: vi.fn((next: { id: string }[]) => {
      mockIdb.folders = [...next];
      return Promise.resolve();
    }),
    upsert: vi.fn(),
    upsertFolder: vi.fn((next: { id: string }) => {
      mockIdb.folders = [
        ...mockIdb.folders.filter((f) => f.id !== next.id),
        next,
      ];
      return Promise.resolve();
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    removeFolders: vi.fn((ids: string[]) => {
      const drop = new Set(ids);
      mockIdb.folders = mockIdb.folders.filter((f) => !drop.has(f.id));
      return Promise.resolve();
    }),
  },
}));

vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({
    clearFolderForFiles: vi.fn().mockResolvedValue(undefined),
  }),
}));

// FolderProvider short-circuits pullFromServer when AppConfig says storage
// is off. These tests are specifically about what happens when the pull
// DOES fire and rejects, so we mock `storageEnabled = true`.
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: { storageEnabled: true, storageSharingEnabled: false },
  }),
}));

/**
 * Probe consumer that surfaces the bits of `useFolders()` this test cares
 * about. Rendered as text nodes so RTL queries can wait on them.
 */
function Probe() {
  const { error, serverReachable } = useFolders();
  return (
    <>
      <div data-testid="error">{error ?? "<null>"}</div>
      <div data-testid="reachable">{String(serverReachable)}</div>
    </>
  );
}

/**
 * Build an axios-shape rejection. `pullFromServer` reads
 * `err.response.status` to classify.
 */
function axiosError(status: number, message = "rejected"): Error {
  const err = new Error(message) as Error & {
    response: { status: number; data: unknown };
  };
  err.response = { status, data: { message } };
  return err;
}

async function renderAndWaitForPull(): Promise<void> {
  render(
    <MemoryRouter>
      <FolderProvider>
        <Probe />
      </FolderProvider>
    </MemoryRouter>,
  );
  // The pull is fired from a mount effect; wait until it has resolved by
  // observing that `mockList` was called at least once and a tick has
  // elapsed for the resulting setState to flush.
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  // Flush microtasks so the catch-block's setState lands.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("FolderContext sync-banner gating", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    // Default each test to a signed-in, non-anonymous user so the pull runs.
    mockAuth.user = { id: "test-user", is_anonymous: false };
    mockAuth.isAnonymous = false;
  });

  test("401 (unauthorized) does NOT surface a banner", async () => {
    mockList.mockRejectedValue(axiosError(401, "unauthorized"));
    await renderAndWaitForPull();
    expect(screen.getByTestId("error").textContent).toBe("<null>");
    // Buttons still need to be disabled - this is intentional.
    expect(screen.getByTestId("reachable").textContent).toBe("false");
  });

  test("403 (storage disabled) does NOT surface a banner", async () => {
    mockList.mockRejectedValue(axiosError(403, "Storage is disabled"));
    await renderAndWaitForPull();
    expect(screen.getByTestId("error").textContent).toBe("<null>");
    expect(screen.getByTestId("reachable").textContent).toBe("false");
  });

  test("500 (server error) DOES surface a banner", async () => {
    // Surfacing the banner also logs a warning - that's the contract this branch
    // tests for.
    expectConsole.warn(/\[FolderContext\] pullFromServer failed/);
    mockList.mockRejectedValue(axiosError(500, "internal"));
    await renderAndWaitForPull();
    expect(screen.getByTestId("error").textContent).toContain(
      "Folder sync failed",
    );
    expect(screen.getByTestId("reachable").textContent).toBe("false");
  });

  test("network error (no response) DOES surface a banner", async () => {
    // axios on a network failure rejects with an Error that has NO
    // `.response` property - that's the "status === undefined" branch
    // the gate explicitly covers. Surfacing the banner also logs a warning.
    expectConsole.warn(/\[FolderContext\] pullFromServer failed/);
    mockList.mockRejectedValue(new Error("ECONNREFUSED"));
    await renderAndWaitForPull();
    expect(screen.getByTestId("error").textContent).toContain(
      "Folder sync failed",
    );
    expect(screen.getByTestId("reachable").textContent).toBe("false");
  });

  test("404 (endpoint missing, core-only build) does NOT surface a banner", async () => {
    // Separate code path from the 4xx gate - 404 specifically means
    // the storage backend isn't deployed; it's a config signal, not a
    // failure to act on.
    mockList.mockRejectedValue(axiosError(404, "not found"));
    await renderAndWaitForPull();
    expect(screen.getByTestId("error").textContent).toBe("<null>");
    expect(screen.getByTestId("reachable").textContent).toBe("false");
  });

  test("guest (anonymous) session does NOT pull from the server", async () => {
    // Guests have no cloud storage; pulling would 401 and (historically)
    // surface a toast. The provider must make no folder request at all.
    mockAuth.user = { id: "guest", is_anonymous: true };
    mockAuth.isAnonymous = true;
    mockList.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <FolderProvider>
          <Probe />
        </FolderProvider>
      </MemoryRouter>,
    );
    // Let mount effects run; the pull must never fire.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockList).not.toHaveBeenCalled();
    expect(screen.getByTestId("reachable").textContent).toBe("false");
  });
});

/** Per-folder mutation 404 = silent cleanup (drop subtree, no banner, pull). */
describe("FolderContext stale-folder 404 cleanup", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    // Reset the stateful IDB mock so each test starts with an empty cache.
    mockIdb.folders = [];
    // Signed-in, non-anonymous user so pullFromServer runs.
    mockAuth.user = { id: "test-user", is_anonymous: false };
    mockAuth.isAnonymous = false;
  });

  function makeFolder(name: string, parentFolderId: FolderId | null = null) {
    return {
      id: createFolderId(),
      name,
      parentFolderId,
      createdAt: 0,
      updatedAt: 0,
    } as FolderRecord;
  }

  type ProbeApi = {
    error: string | null;
    folderCount: number;
    currentFolderId: FolderId | null;
    setCurrentFolderId: (id: FolderId | null) => void;
    rename: (id: FolderId, name: string) => Promise<unknown>;
    delete: (id: FolderId) => Promise<unknown>;
  };

  function ApiProbe(props: { onReady: (api: ProbeApi) => void }) {
    const f = useFolders();
    React.useEffect(() => {
      props.onReady({
        error: f.error,
        folderCount: f.folders.length,
        currentFolderId: f.currentFolderId,
        setCurrentFolderId: f.setCurrentFolderId,
        rename: (id, name) => f.renameFolder(id, name),
        delete: (id) => f.deleteFolder(id),
      });
    }, [f, props]);
    return (
      <>
        <div data-testid="error">{f.error ?? "<null>"}</div>
        <div data-testid="reachable">{String(f.serverReachable)}</div>
        <div data-testid="count">{f.folders.length}</div>
        <div data-testid="current">{f.currentFolderId ?? "<null>"}</div>
      </>
    );
  }

  async function setupWithFolders(
    initial: FolderRecord[],
  ): Promise<{ current: ProbeApi }> {
    // Ref (not plain object) so tests see the latest f-bound api after re-renders.
    mockList.mockResolvedValueOnce(initial);
    const apiRef: { current: ProbeApi | null } = { current: null };
    render(
      <MemoryRouter>
        <FolderProvider>
          <ApiProbe onReady={(api) => (apiRef.current = api)} />
        </FolderProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("count").textContent).toBe(
        String(initial.length),
      ),
    );
    if (!apiRef.current) throw new Error("ApiProbe never reported ready");
    return apiRef as { current: ProbeApi };
  }

  test("renameFolder 404 silently drops folder + descendants, no banner", async () => {
    const parent = makeFolder("parent");
    const child = makeFolder("child", parent.id);
    const sibling = makeFolder("sibling");
    const api = await setupWithFolders([parent, child, sibling]);

    // Convergence pull returns just sibling after the local drop.
    mockList.mockResolvedValueOnce([sibling]);
    mockUpdate.mockRejectedValueOnce(axiosError(404, "Folder not found"));

    await act(async () => {
      const result = await api.current.rename(parent.id, "newname");
      expect(result).toBeNull();
    });

    expect(screen.getByTestId("error").textContent).toBe("<null>");
    await waitFor(() =>
      expect(screen.getByTestId("count").textContent).toBe("1"),
    );
    expect(screen.getByTestId("reachable").textContent).toBe("true");
  });

  test("deleteFolder 404 is treated as already-deleted, returns [id], no banner", async () => {
    const target = makeFolder("target");
    const other = makeFolder("other");
    const api = await setupWithFolders([target, other]);

    mockList.mockResolvedValueOnce([other]);
    mockDelete.mockRejectedValueOnce(axiosError(404, "Folder not found"));

    let result: unknown;
    await act(async () => {
      result = await api.current.delete(target.id);
    });
    expect(result).toEqual([target.id]);

    expect(screen.getByTestId("error").textContent).toBe("<null>");
    await waitFor(() =>
      expect(screen.getByTestId("count").textContent).toBe("1"),
    );
    expect(screen.getByTestId("reachable").textContent).toBe("true");
  });

  test("stale 404 strand-resets currentFolderId when user is inside the dropped subtree", async () => {
    // User is parked inside the about-to-be-deleted subtree → must navigate out.
    const parent = makeFolder("parent");
    const child = makeFolder("child", parent.id);
    const sibling = makeFolder("sibling");
    const api = await setupWithFolders([parent, child, sibling]);

    act(() => {
      api.current.setCurrentFolderId(child.id);
    });
    await waitFor(() =>
      expect(screen.getByTestId("current").textContent).toBe(child.id),
    );

    mockList.mockResolvedValueOnce([sibling]);
    mockUpdate.mockRejectedValueOnce(axiosError(404, "Folder not found"));

    await act(async () => {
      await api.current.rename(parent.id, "doomed-rename");
    });

    // ROOT_FOLDER_ID is null → probe renders "<null>".
    expect(screen.getByTestId("current").textContent).toBe("<null>");
    expect(screen.getByTestId("error").textContent).toBe("<null>");
  });

  test("non-404 mutation errors still surface (regression guard)", async () => {
    const target = makeFolder("target");
    const api = await setupWithFolders([target]);

    mockUpdate.mockRejectedValueOnce(axiosError(500, "boom"));

    let threw = false;
    await act(async () => {
      try {
        await api.current.rename(target.id, "newname");
      } catch {
        threw = true;
      }
    });
    expect(threw).toBe(true);
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("error").textContent).not.toBe("<null>");
  });
});
