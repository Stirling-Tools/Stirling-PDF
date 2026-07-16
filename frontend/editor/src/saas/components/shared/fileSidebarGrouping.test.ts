import { describe, it, expect } from "vitest";
import { buildLabelGroups } from "@app/components/shared/fileSidebarGroupingLogic";
import type { SidebarCategory } from "@app/services/fileSidebarCategories";
import type { StirlingFileStub } from "@app/types/fileContext";

// The grouping only reads id/lastModified/classificationLabels. classificationLabels
// hold label IDS (a file's stored classification), and categories key on ids too.
function stub(
  id: string,
  labels?: string[],
  lastModified = 0,
): StirlingFileStub {
  return { id, lastModified, classificationLabels: labels } as StirlingFileStub;
}

const t = (_key: string, fallback: string) => fallback;

function cat(
  id: string,
  name: string,
  labelKeys: string[],
  hidden = false,
): SidebarCategory {
  return { id, name, icon: "folder", labelKeys, hidden };
}

const LEGAL = cat("legal", "Legal", ["nda", "contract"]);
const FINANCE = cat("finance", "Financial", ["invoice"]);

describe("buildLabelGroups", () => {
  it("rolls a category's labels into ONE group (deduped)", () => {
    const groups = buildLabelGroups(
      [
        stub("a", ["nda"]),
        stub("b", ["contract"]),
        stub("c", ["nda", "contract"]),
      ],
      t,
      [LEGAL],
    )!;
    const legal = groups.find((g) => g.id === "category:legal")!;
    expect(legal.label).toBe("Legal");
    expect(legal.stubs.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("puts a label in no category into Other", () => {
    const groups = buildLabelGroups([stub("a", ["weird-one"])], t, [LEGAL])!;
    expect(groups.some((g) => g.id.startsWith("category:"))).toBe(false);
    expect(groups.at(-1)!.id).toBe("other");
    expect(groups.at(-1)!.stubs.map((s) => s.id)).toEqual(["a"]);
  });

  it("moves a hidden category's files into Other", () => {
    const groups = buildLabelGroups([stub("a", ["invoice"])], t, [
      cat("finance", "Financial", ["invoice"], true),
    ])!;
    expect(groups.some((g) => g.id === "category:finance")).toBe(false);
    expect(groups.at(-1)!.id).toBe("other");
    expect(groups.at(-1)!.stubs.map((s) => s.id)).toEqual(["a"]);
  });

  it("a file with labels in two categories appears in both", () => {
    const groups = buildLabelGroups([stub("a", ["nda", "invoice"])], t, [
      LEGAL,
      FINANCE,
    ])!;
    expect(
      groups.find((g) => g.id === "category:legal")!.stubs.map((s) => s.id),
    ).toEqual(["a"]);
    expect(
      groups.find((g) => g.id === "category:finance")!.stubs.map((s) => s.id),
    ).toEqual(["a"]);
    expect(groups.some((g) => g.id === "other")).toBe(false);
  });

  it("puts unlabelled files in Other at the bottom", () => {
    const groups = buildLabelGroups(
      [stub("a", ["invoice"]), stub("b"), stub("c", [])],
      t,
      [FINANCE],
    )!;
    const other = groups.at(-1)!;
    expect(other.id).toBe("other");
    expect(other.stubs.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("orders groups: Recent, categories alphabetically, Other last", () => {
    const groups = buildLabelGroups(
      [
        stub("a", ["invoice"]),
        stub("b", ["nda"]),
        stub("c", ["zzz"]),
        stub("d"),
      ],
      t,
      [LEGAL, FINANCE],
    )!;
    // "zzz" is in no category, so its file falls to Other with the unlabelled one.
    expect(groups.map((g) => g.id)).toEqual([
      "recent",
      "category:finance",
      "category:legal",
      "other",
    ]);
  });

  it("returns null for an empty library", () => {
    expect(buildLabelGroups([], t, [LEGAL])).toBeNull();
  });
});
