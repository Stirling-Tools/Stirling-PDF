import { describe, expect, test } from "vitest";
import {
  emptyFieldRow,
  rowsFromSchemaString,
  rowsToSchemaString,
} from "@app/hooks/tools/extractFields/fieldsSchema";
import {
  CUSTOM_PRESET,
  FIELD_PRESET_IDS,
  matchPreset,
  presetRows,
} from "@app/hooks/tools/extractFields/fieldsSchemaPresets";

describe("fieldsSchemaPresets", () => {
  test("every preset has 4-6 named, described fields", () => {
    for (const preset of FIELD_PRESET_IDS) {
      const rows = presetRows(preset);
      expect(rows.length).toBeGreaterThanOrEqual(4);
      expect(rows.length).toBeLessThanOrEqual(6);
      for (const row of rows) {
        expect(row.name).toMatch(/^[a-z0-9_]+$/);
        expect(row.description.length).toBeGreaterThan(0);
      }
    }
  });

  test("preset rows survive the schema-string round trip", () => {
    for (const preset of FIELD_PRESET_IDS) {
      const rows = presetRows(preset);
      expect(rowsFromSchemaString(rowsToSchemaString(rows))).toEqual(rows);
    }
  });

  test("matchPreset spots untouched presets and demotes edits to custom", () => {
    const rows = presetRows("invoice");
    expect(matchPreset(rows)).toBe("invoice");
    rows[0] = { ...rows[0], name: "order_ref" };
    expect(matchPreset(rows)).toBe(CUSTOM_PRESET);
    expect(matchPreset([emptyFieldRow()])).toBe(CUSTOM_PRESET);
  });

  test("presetRows hands out fresh copies, not shared references", () => {
    const first = presetRows("receipt");
    first[0].name = "mutated";
    expect(presetRows("receipt")[0].name).not.toBe("mutated");
  });
});
