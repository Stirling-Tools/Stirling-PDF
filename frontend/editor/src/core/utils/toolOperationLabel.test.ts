import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import { toolOperationLabel } from "@app/utils/toolOperationLabel";
import type { ToolOperation } from "@app/types/file";

// Stands in for i18next: echoes the key so the assertions show which lookup ran.
const t = ((key: string, fallback?: string) =>
  key === "home.automate.title" ? "Automate" : (fallback ?? key)) as TFunction;

const op = (over: Partial<ToolOperation>): ToolOperation =>
  ({ toolId: "automate", timestamp: 0, ...over }) as ToolOperation;

describe("toolOperationLabel", () => {
  it("prefers the operation's own label", () => {
    expect(toolOperationLabel(op({ label: "add-page-numbers" }), t)).toBe(
      "add-page-numbers",
    );
  });

  // Every policy records the same "automate" toolId, so without a label each automated version
  // reads identically no matter which pipeline produced it.
  it("falls back to the tool's name when unlabelled", () => {
    expect(toolOperationLabel(op({}), t)).toBe("Automate");
  });

  it("keeps the fallback for an empty label rather than rendering a blank", () => {
    expect(toolOperationLabel(op({ label: "" }), t)).toBe("Automate");
  });
});
