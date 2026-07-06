import { describe, it, expect } from "vitest";
import { buildLabelGroups } from "@app/components/shared/fileSidebarGrouping";
import type { FileSidebarGroupPrefs } from "@app/services/fileSidebarGroupPrefs";
import type { StirlingFileStub } from "@app/types/fileContext";

// The grouping only reads id/lastModified/classificationLabels.
function stub(
  id: string,
  labels?: string[],
  lastModified = 0,
): StirlingFileStub {
  return { id, lastModified, classificationLabels: labels } as StirlingFileStub;
}

const t = (_key: string, fallback: string) => fallback;

const DEFAULTS: FileSidebarGroupPrefs = { hiddenGroups: [], enabledLabels: [] };

describe("buildLabelGroups", () => {
  it("rolls built-in labels up into ONE family group by default", () => {
    // NDA and Contract are both in the "Legal" family.
    const groups = buildLabelGroups(
      [stub("a", ["NDA"]), stub("b", ["Contract"])],
      [],
      t,
      DEFAULTS,
    )!;
    const legal = groups.find((g) => g.id === "family:legal")!;
    expect(legal.label).toBe("Legal");
    expect(legal.stubs.map((s) => s.id)).toEqual(["a", "b"]);
    // No standalone per-label groups unless explicitly enabled.
    expect(groups.some((g) => g.id === "label:nda")).toBe(false);
  });

  it("counts a file once in its family even with two same-family labels", () => {
    const groups = buildLabelGroups(
      [stub("a", ["NDA", "Contract"])],
      [],
      t,
      DEFAULTS,
    )!;
    const legal = groups.find((g) => g.id === "family:legal")!;
    expect(legal.stubs.map((s) => s.id)).toEqual(["a"]);
  });

  it("puts files with no labels in an Other group at the bottom", () => {
    const groups = buildLabelGroups(
      [
        stub("a", ["Invoice"]),
        stub("b"), // undefined labels
        stub("c", []), // explicitly empty labels
      ],
      [],
      t,
      DEFAULTS,
    )!;
    const other = groups.at(-1)!;
    expect(other.id).toBe("other");
    expect(other.stubs.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("moves a hidden family's files into Other", () => {
    const groups = buildLabelGroups(
      [stub("a", ["Lab report"])], // Medical & insurance family
      [],
      t,
      { hiddenGroups: ["family:health"], enabledLabels: [] },
    )!;
    expect(groups.some((g) => g.id === "family:health")).toBe(false);
    expect(groups.at(-1)!.id).toBe("other");
    expect(groups.at(-1)!.stubs.map((s) => s.id)).toEqual(["a"]);
  });

  it("shows an enabled built-in label as its own group (family hidden)", () => {
    const groups = buildLabelGroups(
      [stub("a", ["Lab report"]), stub("b", ["Prescription"])],
      [],
      t,
      { hiddenGroups: ["family:health"], enabledLabels: ["lab report"] },
    )!;
    const lab = groups.find((g) => g.id === "label:lab report")!;
    expect(lab.stubs.map((s) => s.id)).toEqual(["a"]);
    // Prescription's only group (its family) is hidden → Other.
    expect(groups.at(-1)!.stubs.map((s) => s.id)).toEqual(["b"]);
  });

  it("a file in a visible family AND an enabled label appears in both", () => {
    const groups = buildLabelGroups([stub("a", ["Invoice"])], [], t, {
      hiddenGroups: [],
      enabledLabels: ["invoice"],
    })!;
    expect(
      groups.find((g) => g.id === "family:finance")!.stubs.map((s) => s.id),
    ).toEqual(["a"]);
    expect(
      groups.find((g) => g.id === "label:invoice")!.stubs.map((s) => s.id),
    ).toEqual(["a"]);
    expect(groups.some((g) => g.id === "other")).toBe(false);
  });

  it("custom (non-built-in) labels group standalone by default, hideable", () => {
    const visible = buildLabelGroups(
      [stub("a", ["Zoning permit XYZ"])],
      [],
      t,
      DEFAULTS,
    )!;
    const custom = visible.find((g) => g.id === "label:zoning permit xyz")!;
    expect(custom.label).toBe("Zoning permit XYZ");

    const hiddenPrefs = buildLabelGroups(
      [stub("a", ["Zoning permit XYZ"])],
      [],
      t,
      {
        hiddenGroups: ["label:zoning permit xyz"],
        enabledLabels: [],
      },
    )!;
    expect(hiddenPrefs.some((g) => g.id === "label:zoning permit xyz")).toBe(
      false,
    );
    expect(hiddenPrefs.at(-1)!.stubs.map((s) => s.id)).toEqual(["a"]);
  });

  it("orders groups: Recent, visible groups alphabetically, Other last", () => {
    const groups = buildLabelGroups(
      [
        stub("a", ["Invoice"]), // Financial
        stub("b", ["NDA"]), // Legal & contracts
        stub("c", ["Aardvark care sheet"]), // custom → sorts first
        stub("d"), // unlabelled → Other
      ],
      [],
      t,
      DEFAULTS,
    )!;
    expect(groups.map((g) => g.id)).toEqual([
      "recent",
      "label:aardvark care sheet",
      "family:finance",
      "family:legal",
      "other",
    ]);
  });

  it("returns null for an empty library", () => {
    expect(buildLabelGroups([], [], t, DEFAULTS)).toBeNull();
  });
});
