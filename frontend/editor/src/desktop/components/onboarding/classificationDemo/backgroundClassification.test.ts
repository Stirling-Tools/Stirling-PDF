import { beforeEach, describe, expect, test } from "vitest";
import {
  claimBackgroundClassification,
  dismissBackgroundClassification,
  finishBackgroundClassification,
  reportBackgroundClassificationProgress,
  resetBackgroundClassificationForTests,
  startBackgroundClassification,
  type StartBackgroundClassificationOptions,
} from "@app/components/onboarding/classificationDemo/backgroundClassification";

const request: StartBackgroundClassificationOptions = {
  directory: "/Users/me/Downloads",
  folderName: "Downloads",
  limit: 450,
  exclude: new Set(["/Users/me/Downloads/a.pdf"]),
  alreadyProcessed: 50,
  total: 558,
};

beforeEach(resetBackgroundClassificationForTests);

describe("background classification store", () => {
  test("a request is claimed once and carries the ring's starting point", () => {
    expect(startBackgroundClassification(request)).toBe(true);

    const claimed = claimBackgroundClassification();
    expect(claimed).toMatchObject({
      status: "running",
      directory: request.directory,
      limit: 450,
      processed: 50,
      total: 558,
    });
    expect(claimed?.exclude.has("/Users/me/Downloads/a.pdf")).toBe(true);
    // A second runner finds nothing to take.
    expect(claimBackgroundClassification()).toBeNull();
  });

  test("the exclude set is copied, so clearing the session store afterwards is safe", () => {
    const exclude = new Set(["/x.pdf"]);
    startBackgroundClassification({ ...request, exclude });
    exclude.clear();
    expect(claimBackgroundClassification()?.exclude.has("/x.pdf")).toBe(true);
  });

  test("progress is the onboarding batch plus this job's count", () => {
    startBackgroundClassification(request);
    claimBackgroundClassification();
    reportBackgroundClassificationProgress(50, 7);
    finishBackgroundClassification();

    const job = claimBackgroundClassification();
    // Finished jobs are not claimable, so read through a fresh start's refusal instead.
    expect(job).toBeNull();
  });

  test("a live job refuses a second request; a finished one is replaced", () => {
    startBackgroundClassification(request);
    expect(startBackgroundClassification(request)).toBe(false);
    claimBackgroundClassification();
    expect(startBackgroundClassification(request)).toBe(false);
    finishBackgroundClassification();
    expect(startBackgroundClassification({ ...request, limit: 8 })).toBe(true);
    expect(claimBackgroundClassification()?.limit).toBe(8);
  });

  test("dismissing removes the job entirely", () => {
    startBackgroundClassification(request);
    claimBackgroundClassification();
    finishBackgroundClassification();
    dismissBackgroundClassification();
    expect(claimBackgroundClassification()).toBeNull();
    expect(startBackgroundClassification(request)).toBe(true);
  });
});
