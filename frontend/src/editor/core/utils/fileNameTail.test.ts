import { describe, expect, it } from "vitest";
import { splitFileNameTail } from "@editor/utils/fileNameTail";

describe("splitFileNameTail", () => {
  it("keeps the copy suffix and the extension together", () => {
    expect(splitFileNameTail("quarterly-report (edited).pdf")).toEqual({
      head: "quarterly-report",
      tail: " (edited).pdf",
    });
    expect(splitFileNameTail("quarterly-report (edited 2).pdf")).toEqual({
      head: "quarterly-report",
      tail: " (edited 2).pdf",
    });
  });

  it("keeps just the extension for a plain name", () => {
    expect(splitFileNameTail("quarterly-report.pdf")).toEqual({
      head: "quarterly-report",
      tail: ".pdf",
    });
  });

  it("leaves names with nothing to pin whole", () => {
    expect(splitFileNameTail("README")).toEqual({ head: "README", tail: "" });
    expect(splitFileNameTail(".pdf")).toEqual({ head: ".pdf", tail: "" });
    expect(splitFileNameTail("")).toEqual({ head: "", tail: "" });
  });
});
