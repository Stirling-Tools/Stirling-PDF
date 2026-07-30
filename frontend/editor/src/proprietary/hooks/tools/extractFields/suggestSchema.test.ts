import { describe, expect, test } from "vitest";
import { suggestedFieldsToRows } from "@app/hooks/tools/extractFields/suggestSchema";

describe("suggestedFieldsToRows", () => {
  test("maps engine proposals to builder rows", () => {
    expect(
      suggestedFieldsToRows([
        { name: "invoice_number", type: "string", description: "The id" },
        { name: "total", type: "number" },
      ]),
    ).toEqual([
      { name: "invoice_number", type: "string", description: "The id" },
      { name: "total", type: "number", description: "" },
    ]);
  });

  test("coerces unknown types to string and trims values", () => {
    expect(
      suggestedFieldsToRows([
        { name: "  due_date ", type: "date", description: " When due " },
      ]),
    ).toEqual([{ name: "due_date", type: "string", description: "When due" }]);
  });

  test("drops unusable entries defensively", () => {
    expect(
      suggestedFieldsToRows([
        { name: "", type: "string" },
        { type: "string", description: "no name" },
        undefined as never,
      ]),
    ).toEqual([]);
    expect(suggestedFieldsToRows(undefined)).toEqual([]);
  });
});
