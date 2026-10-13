import { describe, expect, it } from "vitest";
import { uniqueName } from "@app/utils/uniqueName";

describe("uniqueName", () => {
  it("keeps a free name as it is", () => {
    expect(uniqueName("Signature", ["Initials"])).toBe("Signature");
  });

  it("numbers a taken name from 2, ignoring case", () => {
    expect(uniqueName("Signature", ["signature"])).toBe("Signature 2");
    expect(uniqueName("Signature", ["Signature", "Signature 2"])).toBe(
      "Signature 3",
    );
  });
});
