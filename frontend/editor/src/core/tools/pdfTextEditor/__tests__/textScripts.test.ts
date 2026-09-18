import { describe, expect, it } from "vitest";
import {
  classifyRunText,
  isPrivateUse,
  isRtlChar,
  isUndecodableChar,
} from "@app/tools/pdfTextEditor/util/textScripts";

describe("run text classification", () => {
  it("treats replacement characters as undecodable", () => {
    expect(classifyRunText("Hello \uFFFD world")).toBe("undecodable");
    expect(classifyRunText("\u0000")).toBe("undecodable");
  });

  it("classifies Hebrew and Arabic as RTL", () => {
    expect(classifyRunText("שלום")).toBe("rtl");
    expect(classifyRunText("مرحبا")).toBe("rtl");
  });

  it("classifies private-use text as PUA, not undecodable", () => {
    // The editor preserves these charcodes, so they stay editable.
    expect(classifyRunText("\uE000\uE001")).toBe("pua");
    expect(classifyRunText("A\uF8FF")).toBe("pua");
  });

  it("keeps plain Latin and CJK editable", () => {
    expect(classifyRunText("Hello, world")).toBe("plain");
    expect(classifyRunText("こんにちは")).toBe("plain");
  });

  it("ranks undecodable above RTL and RTL above PUA", () => {
    expect(classifyRunText("שלום \uE000")).toBe("rtl");
    expect(classifyRunText("שלום \uFFFD")).toBe("undecodable");
  });

  it("range helpers agree with the classifier", () => {
    expect(isPrivateUse(0xe000)).toBe(true);
    expect(isPrivateUse(0x100000)).toBe(true);
    expect(isPrivateUse(0x41)).toBe(false);
    expect(isRtlChar(0x5d0)).toBe(true);
    expect(isRtlChar(0x41)).toBe(false);
    expect(isUndecodableChar(0xfffd)).toBe(true);
  });
});
