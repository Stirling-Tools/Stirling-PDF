import { render, screen, waitFor } from "@testing-library/react";
import { useProcessingFolderCounts } from "@app/components/filesPage/processingFolderCounts";

const COUNTS = '{"processing":1,"done":2}';

let calls = 0;

/** Stable identity, as the real call site's useCallback lister has. */
const listFiles = async (): Promise<{ state: string }[]> => {
  calls += 1;
  return [{ state: "processing" }, { state: "done" }, { state: "done" }];
};

function Counts({ recordId, testId }: { recordId: string; testId: string }) {
  const counts = useProcessingFolderCounts(recordId, listFiles);
  return (
    <span data-testid={testId}>{counts ? JSON.stringify(counts) : "-"}</span>
  );
}

beforeEach(() => {
  calls = 0;
});

test("reads the folder once and reports what it found", async () => {
  render(<Counts recordId="rec-read" testId="only" />);

  await waitFor(() =>
    expect(screen.getByTestId("only")).toHaveTextContent(COUNTS),
  );
  expect(calls).toBe(1);
});

test("a second view of the same folder rides on the first one's request", async () => {
  render(
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

/**
 * The counts arriving re-renders every subscriber. When that re-render resubscribed -
 * an inline subscribe closure is a new identity each time - the store dropped its last
 * subscriber, cleared the numbers and read again, at the speed of the network.
 */
test("the render its own result causes does not start another read", async () => {
  render(<Counts recordId="rec-loop" testId="loop" />);

  await waitFor(() =>
    expect(screen.getByTestId("loop")).toHaveTextContent(COUNTS),
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  expect(calls).toBe(1);
});
