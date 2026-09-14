import { describe, expect, it } from "vitest";
import { policyAcceptsFile } from "@app/services/policyInput";

describe("policy input compatibility", () => {
  it.each([
    ["/api/v1/misc/compress-pdf", "report.PDF", "", true],
    ["/api/v1/misc/compress-pdf", "report", "application/pdf", true],
    ["/api/v1/misc/compress-pdf", "scan.png", "image/png", false],
    ["/api/v1/convert/img/pdf", "scan.PNG", "", true],
    ["/api/v1/convert/img/pdf", "scan.svg", "", true],
    ["/api/v1/convert/img/pdf", "report.pdf", "application/pdf", false],
    ["/api/v1/convert/markdown/pdf", "notes.md", "", true],
    ["/api/v1/convert/markdown/pdf", "notes.txt", "", false],
    ["/api/v1/convert/file/pdf", "anything.custom", "", true],
    ["/unknown", "report.pdf", "application/pdf", false],
    [undefined, "report.pdf", "application/pdf", false],
  ])("%s selects %s: %s → %s", (firstOperation, name, type, expected) => {
    expect(policyAcceptsFile({ firstOperation }, { name, type })).toBe(
      expected,
    );
  });
});
