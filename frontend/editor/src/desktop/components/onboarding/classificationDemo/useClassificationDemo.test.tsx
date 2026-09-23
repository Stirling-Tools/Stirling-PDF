import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The workbench view can remount while its sweep runs. These pin that a remount finds the
// sweep still going and then its result, instead of an idle "Reading" screen nothing
// will ever start again.

const runClassificationDemoSweep = vi.fn();

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => ({ mountLocalFolder: vi.fn() }),
}));
vi.mock("@app/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: vi.fn() }),
}));
vi.mock(
  "@app/components/onboarding/classificationDemo/classificationDemoSweep",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    resolveDownloadsDirectory: () => Promise.resolve("/downloads"),
    runClassificationDemoSweep: (...args: unknown[]) =>
      runClassificationDemoSweep(...args),
  }),
);

import { useClassificationDemo } from "@app/components/onboarding/classificationDemo/useClassificationDemo";
import {
  endClassificationDemo,
  startClassificationDemo,
} from "@app/components/onboarding/classificationDemo/classificationDemoSession";
import type {
  ClassificationDemoDeps,
  ClassificationDemoOutcome,
  ClassificationDemoProgress,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";

const PROGRESS: ClassificationDemoProgress = {
  phase: "processing",
  processed: 2,
  total: 50,
  groups: [],
};

const OUTCOME: ClassificationDemoOutcome = {
  processed: 50,
  groups: [],
  pdfsInFolder: 50,
  remaining: 0,
  sweptPaths: [],
};

let finishSweep: (outcome: ClassificationDemoOutcome) => void;
let sweepDeps: ClassificationDemoDeps;

async function mountedHook() {
  const hook = renderHook(() => useClassificationDemo(true));
  await waitFor(() => expect(hook.result.current.directory).toBe("/downloads"));
  return hook;
}

async function startedHook() {
  const hook = await mountedHook();
  act(() => hook.result.current.start(50));
  return hook;
}

beforeEach(() => {
  startClassificationDemo(50);
  runClassificationDemoSweep.mockImplementation(
    (_dir: string, deps: ClassificationDemoDeps) => {
      sweepDeps = deps;
      return new Promise((resolve) => {
        finishSweep = resolve;
      });
    },
  );
});

afterEach(() => {
  act(() => endClassificationDemo());
  vi.clearAllMocks();
});

describe("useClassificationDemo", () => {
  test("a remounted view shows the sweep that is still running", async () => {
    const first = await startedHook();
    act(() => sweepDeps.onProgress(PROGRESS));
    first.unmount();

    const second = await mountedHook();
    expect(second.result.current.status).toBe("running");
    expect(second.result.current.progress).toEqual(PROGRESS);
    expect(sweepDeps.isCancelled?.()).toBe(false);
  });

  test("a remounted view gets the result of the sweep started before it", async () => {
    const first = await startedHook();
    first.unmount();
    const second = await mountedHook();

    await act(async () => finishSweep(OUTCOME));

    expect(second.result.current.status).toBe("done");
    expect(second.result.current.outcome).toEqual(OUTCOME);
  });

  test("a stopped sweep cannot report into the view afterwards", async () => {
    const hook = await startedHook();
    act(() => hook.result.current.cancel());
    expect(sweepDeps.isCancelled?.()).toBe(true);

    await act(async () => {
      sweepDeps.onProgress(PROGRESS);
      finishSweep(OUTCOME);
    });

    expect(hook.result.current.status).toBe("idle");
    expect(hook.result.current.outcome).toBeNull();
  });

  test("ending the demo stops its sweep and clears what it showed", async () => {
    const hook = await startedHook();
    await act(async () => finishSweep(OUTCOME));

    act(() => endClassificationDemo());

    expect(sweepDeps.isCancelled?.()).toBe(true);
    expect(hook.result.current.status).toBe("idle");
    expect(hook.result.current.outcome).toBeNull();
  });
});
