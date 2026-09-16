import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// The runner is the only thing between "Process the rest" and the sweep, so this pins
// what it hands over: the same deps and the same sweep the onboarding batch used, the
// swept paths as exclusions, and progress that continues from the batch already done.

const runClassificationDemoSweep = vi.fn();
const mountLocalFolder = vi.fn();
const addFiles = vi.fn();

vi.mock(
  "@app/components/onboarding/classificationDemo/classificationDemoSweep",
  () => ({
    runClassificationDemoSweep: (...args: unknown[]) =>
      runClassificationDemoSweep(...args),
  }),
);
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => ({ mountLocalFolder }),
}));
vi.mock("@app/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

import { ClassificationBackgroundRunner } from "@app/components/onboarding/classificationDemo/ClassificationBackgroundRunner";
import {
  resetBackgroundClassificationForTests,
  startBackgroundClassification,
  useBackgroundClassification,
} from "@app/components/onboarding/classificationDemo/backgroundClassification";

function Probe() {
  const job = useBackgroundClassification();
  return (
    <output data-testid="job">
      {job ? `${job.status}:${job.processed}/${job.total}` : "none"}
    </output>
  );
}

beforeEach(() => {
  resetBackgroundClassificationForTests();
  runClassificationDemoSweep.mockReset();
});

describe("ClassificationBackgroundRunner", () => {
  test("runs the requested sweep with the batch's own deps and exclusions", async () => {
    let finish!: () => void;
    runClassificationDemoSweep.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(
      <>
        <ClassificationBackgroundRunner />
        <Probe />
      </>,
    );

    act(() => {
      startBackgroundClassification({
        directory: "/dl",
        folderName: "Downloads",
        limit: 450,
        exclude: new Set(["/dl/done.pdf"]),
        alreadyProcessed: 50,
        total: 558,
      });
    });

    expect(runClassificationDemoSweep).toHaveBeenCalledTimes(1);
    const [directory, deps, options] = runClassificationDemoSweep.mock.calls[0];
    expect(directory).toBe("/dl");
    expect(deps.mountFolder).toBe(mountLocalFolder);
    expect(deps.addFiles).toBe(addFiles);
    expect(options.limit).toBe(450);
    expect(options.exclude.has("/dl/done.pdf")).toBe(true);
    expect(view.getByTestId("job").textContent).toBe("running:50/558");

    act(() => {
      deps.onProgress({
        phase: "processing",
        processed: 7,
        total: 450,
        groups: [],
      });
    });
    expect(view.getByTestId("job").textContent).toBe("running:57/558");

    await act(async () => {
      finish();
    });
    expect(view.getByTestId("job").textContent).toBe("done:57/558");
  });

  test("a sweep that throws still ends the job, so the ring does not hang", async () => {
    runClassificationDemoSweep.mockRejectedValue(new Error("folder gone"));
    const view = render(
      <>
        <ClassificationBackgroundRunner />
        <Probe />
      </>,
    );
    await act(async () => {
      startBackgroundClassification({
        directory: "/dl",
        folderName: "Downloads",
        limit: 10,
        exclude: new Set(),
        alreadyProcessed: 50,
        total: 60,
      });
    });
    expect(view.getByTestId("job").textContent).toBe("done:50/60");
  });

  test("is not cancelled by StrictMode's mount, cleanup, mount", () => {
    // The app renders under StrictMode, which runs effect cleanups once on mount. A
    // cancel flag that cleanup sets and mount never clears cancels every sweep at once.
    runClassificationDemoSweep.mockReturnValue(new Promise(() => {}));
    render(
      <StrictMode>
        <ClassificationBackgroundRunner />
      </StrictMode>,
    );
    act(() => {
      startBackgroundClassification({
        directory: "/dl",
        folderName: "Downloads",
        limit: 10,
        exclude: new Set(),
        alreadyProcessed: 50,
        total: 60,
      });
    });
    expect(runClassificationDemoSweep).toHaveBeenCalledTimes(1);
    const [, deps] = runClassificationDemoSweep.mock.calls[0];
    expect(deps.isCancelled()).toBe(false);
  });

  test("unmounting cancels the sweep between files", () => {
    runClassificationDemoSweep.mockReturnValue(new Promise(() => {}));
    const view = render(<ClassificationBackgroundRunner />);
    act(() => {
      startBackgroundClassification({
        directory: "/dl",
        folderName: "Downloads",
        limit: 10,
        exclude: new Set(),
        alreadyProcessed: 0,
        total: 10,
      });
    });
    const [, deps] = runClassificationDemoSweep.mock.calls[0];
    expect(deps.isCancelled()).toBe(false);
    view.unmount();
    expect(deps.isCancelled()).toBe(true);
  });
});
