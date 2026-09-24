import { describe, it, expect } from "vitest";
import {
  mergePageFields,
  mergeSignatureAppearances,
} from "@app/tools/formFill/formFieldMerge";
import type { FormField } from "@app/tools/formFill/types";

function field(name: string, type: FormField["type"]): FormField {
  return {
    name,
    label: name,
    type,
    value: "",
    options: null,
    displayOptions: null,
    required: false,
    readOnly: false,
    multiSelect: false,
    multiline: false,
    tooltip: null,
    widgets: [{ pageIndex: 0, x: 0, y: 0, width: 10, height: 10 }],
  };
}

describe("mergeSignatureAppearances", () => {
  it("does not duplicate a signature the backend already returned", () => {
    // The backend now returns signature fields; the pdfium pass returns the
    // same field with a rendered appearance. They must merge to ONE entry.
    const backend = [field("FullName", "text"), field("Sign", "signature")];
    const sig = {
      ...field("Sign", "signature"),
      appearanceDataUrl: "data:img",
    };

    const merged = mergeSignatureAppearances(backend, [sig]);

    expect(merged).toHaveLength(2);
    expect(merged.filter((f) => f.name === "Sign")).toHaveLength(1);
    // …and the surviving entry is enriched with the rendered appearance.
    expect(merged.find((f) => f.name === "Sign")?.appearanceDataUrl).toBe(
      "data:img",
    );
  });

  it("appends a signature the backend did not return", () => {
    const backend = [field("FullName", "text")];
    const sig = { ...field("Ghost", "signature"), appearanceDataUrl: "data:x" };

    const merged = mergeSignatureAppearances(backend, [sig]);

    expect(merged).toHaveLength(2);
    expect(merged.map((f) => f.name)).toEqual(["FullName", "Ghost"]);
  });

  it("returns the backend list unchanged when there are no signatures", () => {
    const backend = [field("A", "text"), field("B", "checkbox")];
    expect(mergeSignatureAppearances(backend, [])).toBe(backend);
  });

  it("does not overwrite an existing appearance", () => {
    const backend = [
      { ...field("Sign", "signature"), appearanceDataUrl: "keep" },
    ];
    const sig = { ...field("Sign", "signature"), appearanceDataUrl: "new" };
    const merged = mergeSignatureAppearances(backend, [sig]);
    expect(merged.find((f) => f.name === "Sign")?.appearanceDataUrl).toBe(
      "keep",
    );
  });
});

describe("mergePageFields", () => {
  const radio = (value: string, widgets: FormField["widgets"]): FormField => ({
    ...field("Choice", "radio"),
    value,
    widgets,
  });

  it("re-indexes a radio value when a later page sorts ahead of it", () => {
    // Page 5 loaded first: the checked widget is index 0 of a one-widget list.
    const page5 = radio("0", [
      { pageIndex: 5, x: 0, y: 0, width: 10, height: 10 },
    ]);
    // Page 3 arrives later and sorts ahead of page 5.
    const page3 = radio("", [
      { pageIndex: 3, x: 0, y: 0, width: 10, height: 10 },
    ]);

    const merged = mergePageFields([page5], [page3]);

    expect(merged[0].widgets?.map((w) => w.pageIndex)).toEqual([3, 5]);
    // The checked widget moved to index 1; the stale "0" would select page 3.
    expect(merged[0].value).toBe("1");
  });

  it("keeps a radio value when an earlier page loads first", () => {
    const page3 = radio("", [
      { pageIndex: 3, x: 0, y: 0, width: 10, height: 10 },
    ]);
    const page5 = radio("1", [
      { pageIndex: 5, x: 0, y: 0, width: 10, height: 10 },
    ]);

    const merged = mergePageFields([page3], [page5]);

    expect(merged[0].widgets?.map((w) => w.pageIndex)).toEqual([3, 5]);
    expect(merged[0].value).toBe("1");
  });

  it("leaves a text field's value alone across pages", () => {
    const first = { ...field("Name", "text"), value: "Ada" };
    const second = {
      ...field("Name", "text"),
      widgets: [{ pageIndex: 2, x: 0, y: 0, width: 10, height: 10 }],
    };

    const merged = mergePageFields([first], [second]);

    expect(merged[0].value).toBe("Ada");
    expect(merged[0].widgets).toHaveLength(2);
  });
});
