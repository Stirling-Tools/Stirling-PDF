import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@app/services/processingFolderApi", () => ({
  fetchProcessingFolderRuns: vi.fn(),
}));

import { createAppQueryClient } from "@app/query/queryClient";
import {
  fetchProcessingFolderRuns,
  type ProcessingFolderRun,
} from "@app/services/processingFolderApi";
import { FolderSweepWall } from "@app/components/policies/SweepRunWall";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";

const POLL_MS = 2000;
const fetchRuns = vi.mocked(fetchProcessingFolderRuns);

function run(fileName: string, status: string): ProcessingFolderRun {
  return { runId: `${fileName}-${status}`, fileName, status };
}

/** The app's own defaults, so a test can't pass on a library default the app overrides. */
function mount(ui: ReactNode) {
  const client = createAppQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

/** One poll's worth of time, plus the microtasks its response resolves through. */
async function polls(count: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * count);
  });
}

/** Lets the first read land. The cache notifies asynchronously, so a bare
 *  waitFor on the spy returns before React has applied the result. */
const settle = () => polls(0);

const wall = () => screen.queryByText("processingFolders.wall.title");

beforeEach(() => {
  fetchRuns.mockReset().mockResolvedValue([]);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  resetTabVisibility();
  vi.useRealTimers();
});

test("renders nothing without a policy, and never polls", async () => {
  mount(<FolderSweepWall />);
  await polls(3);

  expect(wall()).toBeNull();
  expect(fetchRuns).not.toHaveBeenCalled();
});

test("stays down for history that was already finished when it opened", async () => {
  fetchRuns.mockResolvedValue([run("old.pdf", "COMPLETED")]);
  mount(<FolderSweepWall policyId="p1" />);

  await settle();
  await polls(2);

  expect(wall()).toBeNull();
});

test("raises itself for a live run and counts the settled ones", async () => {
  fetchRuns.mockResolvedValue([run("a.pdf", "RUNNING")]);
  mount(<FolderSweepWall policyId="p1" />);

  await waitFor(() => expect(wall()).not.toBeNull());
  expect(screen.getByText("0/1")).toBeInTheDocument();

  fetchRuns.mockResolvedValue([
    run("a.pdf", "COMPLETED"),
    run("b.pdf", "RUNNING"),
  ]);
  await polls(1);

  await waitFor(() => expect(screen.getByText("1/2")).toBeInTheDocument());
});

test("stands down after three settled polls", async () => {
  fetchRuns.mockResolvedValue([run("a.pdf", "RUNNING")]);
  mount(<FolderSweepWall policyId="p1" />);
  await waitFor(() => expect(wall()).not.toBeNull());

  fetchRuns.mockResolvedValue([run("a.pdf", "COMPLETED")]);
  await polls(2);
  expect(wall()).not.toBeNull();

  await polls(1);
  await waitFor(() => expect(wall()).toBeNull());
});

test("wakes again for the next sweep after standing down", async () => {
  fetchRuns.mockResolvedValue([run("a.pdf", "RUNNING")]);
  mount(<FolderSweepWall policyId="p1" />);
  await waitFor(() => expect(wall()).not.toBeNull());

  fetchRuns.mockResolvedValue([run("a.pdf", "COMPLETED")]);
  await polls(3);
  await waitFor(() => expect(wall()).toBeNull());

  fetchRuns.mockResolvedValue([
    run("a.pdf", "COMPLETED"),
    run("b.pdf", "RUNNING"),
  ]);
  await polls(1);

  await waitFor(() => expect(wall()).not.toBeNull());
});

test("a failed poll counts as a settled one rather than freezing the wall", async () => {
  fetchRuns.mockResolvedValue([run("a.pdf", "RUNNING")]);
  mount(<FolderSweepWall policyId="p1" />);
  await waitFor(() => expect(wall()).not.toBeNull());

  fetchRuns.mockRejectedValue(new Error("network"));
  await polls(3);

  await waitFor(() => expect(wall()).toBeNull());
});

describe("polling", () => {
  test("keeps reading while the tab is visible", async () => {
    mount(<FolderSweepWall policyId="p1" />);
    await settle();
    expect(fetchRuns).toHaveBeenCalledTimes(1);

    await polls(4);

    expect(fetchRuns).toHaveBeenCalledTimes(5);
  });

  test("stops reading while the tab is hidden, and resumes on the next tick", async () => {
    mount(<FolderSweepWall policyId="p1" />);
    await settle();
    expect(fetchRuns).toHaveBeenCalledTimes(1);

    setTabHidden(true);
    await polls(30);
    expect(fetchRuns).toHaveBeenCalledTimes(1);

    setTabHidden(false);
    await polls(1);
    expect(fetchRuns).toHaveBeenCalledTimes(2);
  });

  test("a hidden tab does not stall a sweep that is already on screen", async () => {
    fetchRuns.mockResolvedValue([run("a.pdf", "RUNNING")]);
    mount(<FolderSweepWall policyId="p1" />);
    await waitFor(() => expect(wall()).not.toBeNull());

    setTabHidden(true);
    await polls(10);

    // Still up: pausing the poll must not be read as the sweep having settled.
    expect(wall()).not.toBeNull();
  });
});
