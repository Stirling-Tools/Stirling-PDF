import { describe, expect, test } from "vitest";
import {
  emptyFieldRow,
  namedRows,
  rowsFromSchemaString,
  rowsToSchemaString,
  type FieldRow,
} from "@app/hooks/tools/extractFields/fieldsSchema";

const rows: FieldRow[] = [
  { name: "invoice_number", type: "string", description: "The invoice id" },
  { name: "total", type: "number", description: "" },
  { name: "paid", type: "boolean", description: "Whether settled" },
];

describe("fieldsSchema", () => {
  test("serializes rows to a JSON Schema object string", () => {
    const schema = JSON.parse(rowsToSchemaString(rows));
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["invoice_number", "total", "paid"]);
    expect(schema.properties.invoice_number).toEqual({
      type: "string",
      description: "The invoice id",
    });
    // Blank descriptions are omitted, not sent as empty strings.
    expect(schema.properties.total).toEqual({ type: "number" });
  });

  test("round-trips rows through the schema string", () => {
    expect(rowsFromSchemaString(rowsToSchemaString(rows))).toEqual(rows);
  });

  test("ignores unnamed builder rows", () => {
    const withBlank = [...rows, emptyFieldRow()];
    expect(namedRows(withBlank)).toHaveLength(3);
    const schema = JSON.parse(rowsToSchemaString(withBlank));
    expect(Object.keys(schema.properties)).toHaveLength(3);
  });

  test("trims names and descriptions on serialize", () => {
    const schema = JSON.parse(
      rowsToSchemaString([
        { name: "  due_date  ", type: "string", description: " When due " },
      ]),
    );
    expect(schema.properties.due_date).toEqual({
      type: "string",
      description: "When due",
    });
  });

  test("parses junk defensively", () => {
    expect(rowsFromSchemaString("not json")).toEqual([]);
    expect(rowsFromSchemaString("{}")).toEqual([]);
    expect(
      rowsFromSchemaString('{"properties":{"x":{"type":"weird"}}}'),
    ).toEqual([{ name: "x", type: "string", description: "" }]);
  });
});
