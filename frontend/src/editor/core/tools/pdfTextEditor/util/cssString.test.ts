import { describe, expect, it } from "vitest";
import { cssString } from "@editor/tools/pdfTextEditor/util/cssString";

describe("cssString", () => {
  it("quotes plain text unchanged", () => {
    expect(cssString("Heading 1")).toBe('"Heading 1"');
  });

  it("escapes quotes and backslashes", () => {
    expect(cssString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("escapes line breaks, so a role name cannot close the string and start a rule", () => {
    const serialized = cssString("Foo\n;}body{display:none}/*");
    expect(serialized).toBe('"Foo\\a ;}body{display:none}/*"');
    expect(serialized).not.toMatch(/[\n\r\f]/);
  });

  it("escapes every control character and replaces NUL", () => {
    expect(cssString("a\r\f\t\u007fb")).toBe('"a\\d \\c \\9 \\7f b"');
    expect(cssString("a\u0000b")).toBe('"a�b"');
  });

  it("keeps characters outside the BMP whole", () => {
    expect(cssString("𝑥")).toBe('"𝑥"');
  });
});
