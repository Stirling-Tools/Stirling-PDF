import { describe, it, expect } from "vitest";
import { buildWorkflowMetadata } from "@app/hooks/signing/useSigningSessionController";

describe("buildWorkflowMetadata", () => {
  it("carries every appearance setting the owner configured", () => {
    expect(
      buildWorkflowMetadata({
        showSignature: true,
        pageNumber: 3,
        reason: "Disposable QA verification",
        location: "Local test",
        showLogo: true,
        includeSummaryPage: false,
      }),
    ).toEqual({
      showSignature: true,
      pageNumber: 3,
      reason: "Disposable QA verification",
      location: "Local test",
      showLogo: true,
      includeSummaryPage: false,
    });
  });

  it("still carries the summary page flag on its own", () => {
    expect(buildWorkflowMetadata({ includeSummaryPage: true })).toEqual({
      includeSummaryPage: true,
    });
  });

  it("omits unset keys rather than sending null, which the backend cast would reject", () => {
    const metadata = buildWorkflowMetadata({ showSignature: true });

    expect(metadata).toEqual({ showSignature: true });
    expect("pageNumber" in metadata).toBe(false);
    expect("reason" in metadata).toBe(false);
    expect("location" in metadata).toBe(false);
  });

  it("treats blank reason and location as unset", () => {
    expect(
      buildWorkflowMetadata({ reason: "   ", location: "", showLogo: false }),
    ).toEqual({ showLogo: false });
  });

  it("produces nothing when the owner configured nothing", () => {
    expect(buildWorkflowMetadata({})).toEqual({});
  });
});
