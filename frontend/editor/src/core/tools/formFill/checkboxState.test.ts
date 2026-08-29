import { describe, expect, it } from "vitest";

import {
  isFieldChecked,
  isGenericOn,
  isWidgetChecked,
} from "@app/tools/formFill/checkboxState";

describe("isWidgetChecked", () => {
  it("ticks only the widget whose export value matches", () => {
    expect(isWidgetChecked({ exportValue: "Red" }, "Red")).toBe(true);
    expect(isWidgetChecked({ exportValue: "Blue" }, "Red")).toBe(false);
  });

  it("accepts the on-state spellings the backend accepts", () => {
    for (const value of ["Yes", "true", "1", "on", "checked", "CHECKED"]) {
      expect(isWidgetChecked({ exportValue: "Red" }, value)).toBe(true);
    }
  });

  it("falls back to non-Off when the widget has no export value", () => {
    expect(isWidgetChecked({ exportValue: null }, "Yes")).toBe(true);
    expect(isWidgetChecked({ exportValue: null }, "Off")).toBe(false);
    expect(isWidgetChecked({ exportValue: null }, "off")).toBe(false);
    expect(isWidgetChecked({ exportValue: null }, "")).toBe(false);
  });

  it("treats a missing value as unchecked", () => {
    expect(isWidgetChecked({ exportValue: "Red" }, undefined)).toBe(false);
    expect(isWidgetChecked(undefined, null)).toBe(false);
  });
});

describe("isFieldChecked", () => {
  const widgets = [{ exportValue: "Red" }, { exportValue: "Blue" }];

  it("ticks when any kid matches, not only the first", () => {
    expect(isFieldChecked(widgets, "Blue")).toBe(true);
    expect(isFieldChecked(widgets, "Red")).toBe(true);
  });

  it("stays unticked for a state no kid carries", () => {
    expect(isFieldChecked(widgets, "Green")).toBe(false);
    expect(isFieldChecked(widgets, "Off")).toBe(false);
  });

  it("accepts legacy on-values against a field that has export values", () => {
    expect(isFieldChecked(widgets, "true")).toBe(true);
  });

  it("falls back to non-Off when no kid declares an export value", () => {
    expect(isFieldChecked([{ exportValue: null }], "Yes")).toBe(true);
    expect(isFieldChecked([{ exportValue: null }], "Off")).toBe(false);
  });
});

describe("isGenericOn", () => {
  it("is false for empty, whitespace and Off in any case", () => {
    expect(isGenericOn("")).toBe(false);
    expect(isGenericOn("   ")).toBe(false);
    expect(isGenericOn("Off")).toBe(false);
    expect(isGenericOn("OFF")).toBe(false);
    expect(isGenericOn(null)).toBe(false);
  });

  it("is true for any other non-empty state", () => {
    expect(isGenericOn("Yes")).toBe(true);
    expect(isGenericOn("Red")).toBe(true);
  });
});
