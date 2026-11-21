import { describe, expect, it } from "vitest";
import {
  COPY_OFFSET_PT,
  duplicateInPlace,
  duplicateToAllPages,
  templateFromField,
} from "@editor/tools/formFill/fieldDuplication";
import type { FormField } from "@editor/tools/formFill/types";

function field(overrides: Partial<FormField> = {}): FormField {
  return {
    name: "Name",
    label: "Name",
    type: "text",
    value: "",
    options: null,
    displayOptions: null,
    required: true,
    readOnly: false,
    multiSelect: false,
    multiline: false,
    tooltip: "Your name",
    widgets: [
      {
        pageIndex: 1,
        x: 50,
        y: 100,
        width: 200,
        height: 20,
        fontSize: 11,
        cropBoxHeight: 800,
      },
    ],
    ...overrides,
  };
}

describe("templateFromField", () => {
  it("flips the top-left widget into lower-left add-fields space", () => {
    const template = templateFromField(field());
    expect(template).toMatchObject({
      name: "Name",
      type: "text",
      pageIndex: 1,
      x: 50,
      y: 800 - 100 - 20,
      width: 200,
      height: 20,
      required: true,
      tooltip: "Your name",
      fontSize: 11,
    });
  });

  it("leaves out the filled-in value", () => {
    const template = templateFromField(field({ value: "Ada Lovelace" }));
    expect(template?.defaultValue).toBeUndefined();
  });

  it("uses staged geometry and properties", () => {
    const template = templateFromField(field(), {
      targetName: "Name",
      name: "Renamed",
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      required: false,
    });
    expect(template).toMatchObject({
      name: "Renamed",
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      required: false,
    });
  });

  it("rebuilds a radio group's box from its options on the anchor page", () => {
    const template = templateFromField(
      field({
        type: "radio",
        options: ["A", "B"],
        widgets: [
          {
            pageIndex: 0,
            x: 10,
            y: 10,
            width: 12,
            height: 12,
            cropBoxHeight: 500,
          },
          {
            pageIndex: 0,
            x: 10,
            y: 40,
            width: 12,
            height: 12,
            cropBoxHeight: 500,
          },
        ],
      }),
    );
    expect(template).toMatchObject({
      x: 10,
      y: 500 - 52,
      width: 12,
      height: 42,
      options: ["A", "B"],
    });
  });

  it("returns null when the page height is unknown", () => {
    const f = field();
    f.widgets = [{ ...f.widgets![0], cropBoxHeight: undefined }];
    expect(templateFromField(f)).toBeNull();
  });
});

const none = new Set<string>();

describe("duplicateInPlace", () => {
  it("offsets the copy and names it after the source", () => {
    const copy = duplicateInPlace(templateFromField(field())!, none);
    expect(copy.name).toBe("Name_copy1");
    expect(copy.x).toBe(50 + COPY_OFFSET_PT);
    expect(copy.y).toBe(680 - COPY_OFFSET_PT);
    expect(copy.pageIndex).toBe(1);
  });

  it("labels the copy after the source's label, numbered like its name", () => {
    const copy = duplicateInPlace(
      templateFromField(field({ name: "firstName", label: "First name" }))!,
      new Set(["firstName_copy1"]),
    );
    expect(copy.name).toBe("firstName_copy2");
    expect(copy.label).toBe("First name_copy2");
  });

  it("takes the next free number", () => {
    const copy = duplicateInPlace(
      templateFromField(field())!,
      new Set(["Name_copy1", "Name_copy2"]),
    );
    expect(copy.name).toBe("Name_copy3");
  });

  it("continues the sequence when copying a copy", () => {
    const copy = duplicateInPlace(
      templateFromField(field({ name: "Name_copy1" }))!,
      new Set(["Name", "Name_copy1"]),
    );
    expect(copy.name).toBe("Name_copy2");
  });
});

describe("duplicateToAllPages", () => {
  it("copies to every page except the source, at the same position", () => {
    const copies = duplicateToAllPages(templateFromField(field())!, 4, none);
    expect(copies.map((c) => c.pageIndex)).toEqual([0, 2, 3]);
    expect(copies.map((c) => c.name)).toEqual([
      "Name_copy1",
      "Name_copy2",
      "Name_copy3",
    ]);
    expect(copies.every((c) => c.x === 50 && c.y === 680)).toBe(true);
  });

  it("skips numbers already in use", () => {
    const copies = duplicateToAllPages(
      templateFromField(field())!,
      3,
      new Set(["Name_copy2"]),
    );
    expect(copies.map((c) => c.name)).toEqual(["Name_copy1", "Name_copy3"]);
  });

  it("drops a qualified name's parents, which a new field cannot carry", () => {
    const copies = duplicateToAllPages(
      templateFromField(field({ name: "applicant.name" }))!,
      2,
      none,
    );
    expect(copies[0].name).toBe("name_copy1");
  });

  it("produces nothing for a single-page document", () => {
    const onFirstPage = { ...templateFromField(field())!, pageIndex: 0 };
    expect(duplicateToAllPages(onFirstPage, 1, none)).toEqual([]);
  });
});
