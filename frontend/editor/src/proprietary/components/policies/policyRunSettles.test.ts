import { describe, expect, it } from "vitest";
import { finishedWithNothingToDeliver } from "@app/components/policies/usePolicyAutoRun";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

/**
 * A redaction that matches nothing completes with no output file. The import
 * effect used to skip those runs entirely, so `imported` never flipped and the
 * file's badge + blocking overlay spun forever - on every engine.
 */
const run = (overrides: Partial<PolicyRunRecord> = {}): PolicyRunRecord =>
  ({
    runId: "r",
    categoryId: "security",
    fileId: "f",
    fileName: "f.pdf",
    fileSize: 1,
    target: "saas",
    status: "COMPLETED",
    outputs: [],
    error: null,
    startedAt: 0,
    ...overrides,
  }) as PolicyRunRecord;

describe("finishedWithNothingToDeliver", () => {
  it("settles a completed run that produced no output", () => {
    expect(finishedWithNothingToDeliver(run())).toBe(true);
  });

  it("leaves a run with outputs to the import path", () => {
    expect(
      finishedWithNothingToDeliver(
        run({ outputs: [{ fileId: "o", fileName: "o.pdf" }] as never }),
      ),
    ).toBe(false);
  });

  it("ignores runs that aren't finished, or are already settled", () => {
    expect(finishedWithNothingToDeliver(run({ status: "PENDING" }))).toBe(
      false,
    );
    expect(finishedWithNothingToDeliver(run({ status: "FAILED" }))).toBe(false);
    expect(finishedWithNothingToDeliver(run({ imported: true }))).toBe(false);
  });

  it("leaves classification alone - it settles via its own label path", () => {
    expect(
      finishedWithNothingToDeliver(run({ categoryId: "classification" })),
    ).toBe(false);
  });
});
