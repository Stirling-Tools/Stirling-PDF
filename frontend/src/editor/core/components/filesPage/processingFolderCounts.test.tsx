import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createAppQueryClient } from "@app/query/queryClient";
import { useProcessingFolderCounts } from "@app/components/filesPage/processingFolderCounts";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";

const COUNTS = '{"processing":1,"done":2}';
const POLL_MS = 5000;

let calls = 0;
let byRecord: string[] = [];

/** Stable identity, as the real call site's useCallback lister has. */
const listFiles = async (recordId: string): Promise<{ state: string }[]> => {
  calls += 1;
  byRecord.push(recordId);
  return [{ state: "processing" }, { state: "done" }, { state: "done" }];
};

function Counts({ recordId, testId }: { recordId: string; testId: string }) {
  const counts = useProcessingFolderCounts(recordId, listFiles);
  return (
    <span data-testid={testId}>{counts ? JSON.stringify(counts) : "-"}</span>
  );
}

/** The app's own defaults, so a test can't pass on a library default the app overrides. */
function mount(ui: ReactNode) {
  const client = createAppQueryClient();
  const result = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { ...result, client };
}

beforeEach(() => {
  calls = 0;
  byRecord = [];
});

afterEach(() => {
  resetTabVisibility();
  vi.useRealTimers();
});

test("reads the folder once and reports what it found", async () => {
  mount(<Counts recordId="rec-read" testId="only" />);

  await waitFor(() =>
    expect(screen.getByTestId("only")).toHaveTextContent(COUNTS),
  );
  expect(calls).toBe(1);
});

test("a second view of the same folder rides on the first one's request", async () => {
  mount(
    <>
      <Counts recordId="rec-shared" testId="card" />
      <Counts recordId="rec-shared" testId="row" />
    </>,
  );

  await waitFor(() =>
    expect(screen.getByTestId("row")).toHaveTextContent(COUNTS),
  );
  expect(screen.getByTestId("card")).toHaveTextContent(COUNTS);
  expect(calls).toBe(1);
});

test("two folders on screen each read their own", async () => {
  mount(
    <>
      <Counts recordId="rec-a" testId="a" />
      <Counts recordId="rec-b" testId="b" />
    </>,
  );

  await waitFor(() => expect(calls).toBe(2));
  expect(new Set(byRecord)).toEqual(new Set(["rec-a", "rec-b"]));
});

/**
 * The counts arriving re-renders every subscriber. When that re-render resubscribed -
 * an inline subscribe closure is a new identity each time - the store dropped its last
 * subscriber, cleared the numbers and read again, at the speed of the network.
 */
test("the render its own result causes does not start another read", async () => {
  mount(<Counts recordId="rec-loop" testId="loop" />);

  await waitFor(() =>
    expect(screen.getByTestId("loop")).toHaveTextContent(COUNTS),
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  expect(calls).toBe(1);
});

/** The footgun the old store documented: an unstable lister must not cost a request. */
test("a lister whose identity changes every render does not re-read", async () => {
  function Unstable() {
    const counts = useProcessingFolderCounts(
      "rec-unstable",
      async (recordId: string) => listFiles(recordId),
    );
    return <span data-testid="unstable">{counts ? "ok" : "-"}</span>;
  }

  const { rerender, client } = mount(<Unstable />);
  await waitFor(() =>
    expect(screen.getByTestId("unstable")).toHaveTextContent("ok"),
  );

  for (let i = 0; i < 5; i += 1) {
    rerender(
      <QueryClientProvider client={client}>
        <Unstable />
      </QueryClientProvider>,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 200));

  expect(calls).toBe(1);
});

describe("polling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  test("keeps the numbers current while the tab is visible", async () => {
    mount(<Counts recordId="rec-visible" testId="visible" />);
    await waitFor(() => expect(calls).toBe(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    });

    expect(calls).toBe(5);
  });

  test("stops requesting while the tab is hidden, and resumes on the next tick", async () => {
    mount(<Counts recordId="rec-hidden" testId="hidden" />);
    await waitFor(() => expect(calls).toBe(1));

    setTabHidden(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 12);
    });
    expect(calls).toBe(1);

    setTabHidden(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(calls).toBe(2);
  });

  test("one poll serves both views of the same folder", async () => {
    mount(
      <>
        <Counts recordId="rec-both" testId="card" />
        <Counts recordId="rec-both" testId="row" />
      </>,
    );
    await waitFor(() => expect(calls).toBe(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });

    expect(calls).toBe(4);
  });
});
