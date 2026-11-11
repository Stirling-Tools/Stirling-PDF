// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CREATABLE_SOURCE_TYPES } from "@processor/components/sources/sourceTypes";

function modeDefault(type: string) {
  return CREATABLE_SOURCE_TYPES.find(
    (source) => source.type === type,
  )?.fields.find((field) => field.key === "mode")?.defaultValue;
}

describe("cloud source modes", () => {
  it.each(["onedrive", "sharepoint", "googledrive"])(
    "%s keeps the user's originals unless consume is chosen",
    (type) => {
      expect(modeDefault(type)).toBe("track");
    },
  );

  it("network folders still consume by default", () => {
    expect(modeDefault("sftp")).toBe("consume");
  });
});
