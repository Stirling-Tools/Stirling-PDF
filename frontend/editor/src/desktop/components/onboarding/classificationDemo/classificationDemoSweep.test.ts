import { beforeEach, describe, expect, test, vi } from "vitest";

// Pins the sweep's contract: browser-only classification, results written locked so the
// classification demo's files never reach the AI, and the batch accounting follow-ups depend on.

const classifyFileHeuristically = vi.fn();
const meterClassificationRun = vi.fn();
const listDirectory = vi.fn();
const readDiskFile = vi.fn();

vi.mock("@app/services/localFolderContents", () => ({
  canListDirectory: true,
  listDirectory: (...args: unknown[]) => listDirectory(...args),
  readDiskFile: (...args: unknown[]) => readDiskFile(...args),
}));
vi.mock("@app/services/heuristic/heuristicClassification", () => ({
  classifyFileHeuristically: (...args: unknown[]) =>
    classifyFileHeuristically(...args),
}));
vi.mock("@app/services/classificationMeter", () => ({
  meterClassificationRun: (...args: unknown[]) =>
    meterClassificationRun(...args),
}));
import {
  mergeOutcomes,
  pickRecentPdfs,
  runClassificationDemoSweep,
  type ClassificationDemoDeps,
  type ClassificationDemoOutcome,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";

function entry(name: string, lastModified: number) {
  return { path: `/downloads/${name}`, name, sizeBytes: 1, lastModified };
}

let addedFileId = 0;

function deps(
  overrides: Partial<ClassificationDemoDeps> = {},
): ClassificationDemoDeps {
  return {
    mountFolder: vi.fn().mockResolvedValue(undefined),
    addFiles: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve([{ fileId: `file-${++addedFileId}` }]),
      ),
    onProgress: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Ids restart per test, so assertions can name the file they expect.
  addedFileId = 0;
  listDirectory.mockResolvedValue({
    files: [entry("a.pdf", 3), entry("notes.txt", 9), entry("b.pdf", 1)],
    directories: [],
  });
  readDiskFile.mockImplementation((e: { name: string }) =>
    Promise.resolve(new File(["x"], e.name, { type: "application/pdf" })),
  );
  classifyFileHeuristically.mockResolvedValue({
    labels: ["invoice"],
    confidence: "low",
    score: 10,
    isEnglish: true,
  });
});

describe("pickRecentPdfs", () => {
  test("keeps PDFs only, newest first, capped at the limit", () => {
    const picked = pickRecentPdfs(
      [entry("old.pdf", 1), entry("skip.txt", 99), entry("new.pdf", 5)],
      1,
    );
    expect(picked.map((f) => f.name)).toEqual(["new.pdf"]);
  });
});

describe("runClassificationDemoSweep", () => {
  test("writes each document to storage with its verdict already on the stub", async () => {
    // A "low" verdict is exactly what the local pass would escalate to the AI engine.
    // Stamping the labels at birth is what stops it claiming the file at all.
    const d = deps();
    const outcome = await runClassificationDemoSweep("/downloads", d);

    expect(classifyFileHeuristically).toHaveBeenCalledTimes(2);
    expect(d.addFiles).toHaveBeenCalledTimes(2);
    expect(d.addFiles).toHaveBeenCalledWith(
      [expect.any(File)],
      expect.objectContaining({
        // Locked, not merely labelled: the lock is what the policy engine checks.
        presetClassification: { labels: ["invoice"], confidence: "low" },
        // Straight to storage: the library groups the document without it becoming an
        // open file, so nothing is selected and the user's workspace is left alone.
        skipWorkspaceDispatch: true,
        selectFiles: false,
      }),
    );
    expect(outcome.processed).toBe(2);
    expect(outcome.groups).toEqual([
      {
        id: "finance",
        name: "Financial",
        count: 2,
        labels: [{ id: "invoice", name: "Invoice", count: 2 }],
      },
    ]);
  });

  test("meters the batch once, for the documents it actually classified", async () => {
    await runClassificationDemoSweep("/downloads", deps());

    expect(meterClassificationRun).toHaveBeenCalledTimes(1);
    expect(meterClassificationRun).toHaveBeenCalledWith(
      expect.objectContaining({ documentCount: 2 }),
    );
  });

  test("meters nothing when no document could be classified", async () => {
    classifyFileHeuristically.mockRejectedValue(new Error("encrypted"));

    const outcome = await runClassificationDemoSweep("/downloads", deps());

    expect(outcome.processed).toBe(0);
    expect(meterClassificationRun).not.toHaveBeenCalled();
  });

  test("skips an unreadable document but still retires it", async () => {
    classifyFileHeuristically.mockRejectedValueOnce(new Error("encrypted"));

    const outcome = await runClassificationDemoSweep("/downloads", deps());

    expect(outcome.processed).toBe(1);
    expect(outcome.sweptPaths).toHaveLength(2);
  });

  test("reports what the sweep left behind so a follow-up batch can be offered", async () => {
    const outcome = await runClassificationDemoSweep("/downloads", deps(), {
      limit: 1,
    });

    expect(outcome.processed).toBe(1);
    expect(outcome.pdfsInFolder).toBe(2);
    expect(outcome.remaining).toBe(1);
  });

  test("resumes after the documents a previous sweep already covered", async () => {
    const d = deps();
    await runClassificationDemoSweep("/downloads", d, {
      limit: 1,
      exclude: new Set(["/downloads/a.pdf"]),
    });

    expect(readDiskFile).toHaveBeenCalledTimes(1);
    expect(readDiskFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "b.pdf" }),
    );
  });

  test("retires a document it could not classify instead of re-offering it forever", async () => {
    // Regression: resuming from the count of SUCCESSES pulled each follow-up back over
    // covered ground and stranded as many at the end ("19 more", then "4 more").
    classifyFileHeuristically.mockRejectedValueOnce(new Error("encrypted"));

    const first = await runClassificationDemoSweep("/downloads", deps(), {
      limit: 1,
    });
    expect(first.processed).toBe(0);
    expect(first.sweptPaths).toEqual(["/downloads/a.pdf"]);
    expect(first.remaining).toBe(1);

    const second = await runClassificationDemoSweep("/downloads", deps(), {
      exclude: new Set(first.sweptPaths),
    });
    expect(second.sweptPaths).toEqual(["/downloads/b.pdf"]);
    expect(second.remaining).toBe(0);
  });

  test("counts a document the sweep took on even when it is cancelled part-way", async () => {
    let seen = 0;
    const d = deps({ isCancelled: () => seen++ > 0 });

    const outcome = await runClassificationDemoSweep("/downloads", d);

    // The first document was swept; the second was never started, so it stays eligible.
    expect(outcome.sweptPaths).toEqual(["/downloads/a.pdf"]);
    expect(outcome.remaining).toBe(1);
  });

  test("stops between files once cancelled", async () => {
    const outcome = await runClassificationDemoSweep(
      "/downloads",
      deps({ isCancelled: () => true }),
    );

    expect(classifyFileHeuristically).not.toHaveBeenCalled();
    expect(outcome.processed).toBe(0);
  });

  test("rolls unlabelled documents up under Other", async () => {
    classifyFileHeuristically.mockResolvedValue({
      labels: [],
      confidence: "none",
      score: 0,
      isEnglish: false,
    });

    const outcome = await runClassificationDemoSweep("/downloads", deps(), {
      unclassifiedName: "Other",
    });

    // Nothing matched, so there is no document type to break the slice down into.
    expect(outcome.groups).toEqual([
      { id: "other", name: "Other", count: 2, labels: [] },
    ]);
  });

  test("keeps the document types behind each roll-up, biggest first", async () => {
    // The heuristic names a real label, not just a family, so the results chart can
    // drill into "Financial" and show the Invoice/Receipt split behind it.
    const verdict = (label: string) => ({
      labels: [label],
      confidence: "high",
      score: 9,
      isEnglish: true,
    });
    listDirectory.mockResolvedValue({
      files: [entry("a.pdf", 3), entry("b.pdf", 2), entry("c.pdf", 1)],
      directories: [],
    });
    classifyFileHeuristically
      .mockResolvedValueOnce(verdict("receipt"))
      .mockResolvedValueOnce(verdict("invoice"))
      .mockResolvedValueOnce(verdict("invoice"));

    const outcome = await runClassificationDemoSweep("/downloads", deps());

    const finance = outcome.groups.find((g) => g.id === "finance");
    expect(finance?.count).toBe(3);
    expect(finance?.labels).toEqual([
      { id: "invoice", name: "Invoice", count: 2 },
      { id: "receipt", name: "Receipt", count: 1 },
    ]);
  });
});

describe("mergeOutcomes", () => {
  const outcome = (
    partial: Partial<ClassificationDemoOutcome>,
  ): ClassificationDemoOutcome => ({
    processed: 0,
    groups: [],
    pdfsInFolder: 0,
    remaining: 0,
    sweptPaths: [],
    ...partial,
  });

  test("adds a follow-up batch to the results already on screen", () => {
    // "Process the rest" continues the same pile: showing only the last batch made a
    // final run of one document look like the whole sweep.
    const merged = mergeOutcomes(
      outcome({
        processed: 47,
        groups: [
          {
            id: "finance",
            name: "Financial",
            count: 47,
            labels: [{ id: "invoice", name: "Invoice", count: 47 }],
          },
        ],
        sweptPaths: ["/a.pdf"],
      }),
      outcome({
        processed: 1,
        groups: [
          {
            id: "legal",
            name: "Legal",
            count: 1,
            labels: [{ id: "contract", name: "Contract", count: 1 }],
          },
        ],
        sweptPaths: ["/b.pdf"],
      }),
    );

    expect(merged.processed).toBe(48);
    expect(merged.groups.map((g) => [g.id, g.count])).toEqual([
      ["finance", 47],
      ["legal", 1],
    ]);
    expect(merged.sweptPaths).toEqual(["/a.pdf", "/b.pdf"]);
  });

  test("combines counts for a type both batches found", () => {
    const one = {
      id: "finance",
      name: "Financial",
      count: 2,
      labels: [{ id: "invoice", name: "Invoice", count: 2 }],
    };
    const merged = mergeOutcomes(
      outcome({ processed: 2, groups: [one] }),
      outcome({
        processed: 3,
        groups: [
          {
            ...one,
            count: 3,
            labels: [
              { id: "invoice", name: "Invoice", count: 1 },
              { id: "receipt", name: "Receipt", count: 2 },
            ],
          },
        ],
      }),
    );

    expect(merged.groups).toHaveLength(1);
    expect(merged.groups[0].count).toBe(5);
    // Biggest type first, so the breakdown stays ordered after the fold.
    expect(merged.groups[0].labels).toEqual([
      { id: "invoice", name: "Invoice", count: 3 },
      { id: "receipt", name: "Receipt", count: 2 },
    ]);
  });

  test("takes what is left from the newer sweep, which re-listed the folder", () => {
    const merged = mergeOutcomes(
      outcome({ pdfsInFolder: 60, remaining: 10 }),
      outcome({ pdfsInFolder: 62, remaining: 0 }),
    );

    expect(merged.pdfsInFolder).toBe(62);
    expect(merged.remaining).toBe(0);
  });

  test("does not mutate either input", () => {
    const previous = outcome({
      processed: 1,
      groups: [
        {
          id: "finance",
          name: "Financial",
          count: 1,
          labels: [{ id: "invoice", name: "Invoice", count: 1 }],
        },
      ],
    });
    mergeOutcomes(previous, previous);

    expect(previous.processed).toBe(1);
    expect(previous.groups[0].count).toBe(1);
    expect(previous.groups[0].labels[0].count).toBe(1);
  });
});

describe("settling swept documents locally", () => {
  test("writes every verdict locked, whatever the confidence", async () => {
    // A low-confidence verdict is exactly what the policy path would escalate, so the
    // lock has to be unconditional rather than a property of confident results.
    classifyFileHeuristically.mockResolvedValue({
      labels: ["invoice"],
      confidence: "none",
      score: 0,
      isEnglish: true,
    });
    const d = deps();

    await runClassificationDemoSweep("/downloads", d);

    for (const call of vi.mocked(d.addFiles).mock.calls) {
      expect(call[1]?.presetClassification).toBeDefined();
    }
  });

  test("adds nothing for a document that could not be classified", async () => {
    classifyFileHeuristically.mockRejectedValue(new Error("encrypted"));

    const d = deps();
    await runClassificationDemoSweep("/downloads", d);

    expect(d.addFiles).not.toHaveBeenCalled();
  });

  test("meters under its own name, not the Classification policy's", async () => {
    // Same billing today, separate identity, so onboarding can be repriced alone.
    await runClassificationDemoSweep("/downloads", deps());

    // `source` is what the server prices on; policyName is only the audit label.
    expect(meterClassificationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        policyName: "Onboarding classification",
        source: "onboarding",
      }),
    );
  });
});
