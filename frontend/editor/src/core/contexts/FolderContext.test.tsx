import React from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

import { FolderProvider, useFolders } from "@app/contexts/FolderContext";

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
vi.mock("@app/services/folderSyncService", () => ({
  folderSyncService: {
    list: () => mockList(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@app/services/folderStorage", () => ({
  folderStorage: {
    getAllFolders: vi.fn().mockResolvedValue([]),
    replaceAll: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
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
    <FolderProvider>
      <Probe />
    </FolderProvider>,
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
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
});
