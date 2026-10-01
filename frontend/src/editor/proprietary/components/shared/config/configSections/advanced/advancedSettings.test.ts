import { describe, expect, test } from "vitest";
import {
  DEFAULT_DATASOURCE,
  isEmbeddedH2Database,
} from "@app/components/shared/config/configSections/advanced/advancedSettings";

describe("isEmbeddedH2Database", () => {
  test("a stock install with no datasource block is embedded", () => {
    expect(isEmbeddedH2Database(undefined)).toBe(true);
  });

  test("the pre-filled form defaults do not make it a custom database", () => {
    // The regression: DEFAULT_DATASOURCE.type is "postgresql" so the picker has
    // something to show, and reading it first hid backups on every stock install.
    expect(DEFAULT_DATASOURCE.type).toBe("postgresql");
    expect(DEFAULT_DATASOURCE.enableCustomDatabase).toBe(false);
    expect(isEmbeddedH2Database(DEFAULT_DATASOURCE)).toBe(true);
  });

  test("custom database on with postgres is not embedded", () => {
    expect(
      isEmbeddedH2Database({
        ...DEFAULT_DATASOURCE,
        enableCustomDatabase: true,
      }),
    ).toBe(false);
  });

  test("custom database on but pointed at H2 still backs up", () => {
    expect(
      isEmbeddedH2Database({
        ...DEFAULT_DATASOURCE,
        enableCustomDatabase: true,
        type: "H2",
      }),
    ).toBe(true);
  });
});
