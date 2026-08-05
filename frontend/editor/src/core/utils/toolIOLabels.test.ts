import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_FORMATS, type ToolFormat } from "@app/types/toolIO";
import {
  getToolFormatLabel,
  getToolFormatListLabel,
} from "@app/utils/toolIOLabels";

/** The en-US `[toolFormat]` block, read straight from the locale file. */
function toolFormatLabels(): Record<string, string> {
  let current = dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 12; i++) {
    try {
      const toml = readFileSync(
        resolve(current, "public/locales/en-US/translation.toml"),
        "utf-8",
      );
      const section = toml.split("\n[toolFormat]\n")[1]?.split("\n[")[0] ?? "";
      return Object.fromEntries(
        section
          .split("\n")
          .map((line) => /^(\w+) = "(.*)"$/.exec(line.trim()))
          .filter((m): m is RegExpExecArray => m !== null)
          .map((m) => [m[1], m[2]]),
      );
    } catch {
      current = resolve(current, "..");
    }
  }
  throw new Error("en-US translation.toml not found above the test directory");
}

const labels = toolFormatLabels();
const t = ((key: string) =>
  labels[key.replace("toolFormat.", "")] ?? key) as never;

describe("tool format labels", () => {
  it("gives every format a phrase, so no wire value reaches the reader", () => {
    const missing = TOOL_FORMATS.filter((format) => !labels[format]);
    expect(missing).toEqual([]);
  });

  it("never renders the enum name itself", () => {
    // PDF_ENCRYPTED is the giveaway: a label that still shouts in SCREAMING_SNAKE
    // is a wire value that escaped into the UI.
    for (const format of TOOL_FORMATS) {
      const label = getToolFormatLabel(t, format);
      expect(label).not.toMatch(/^[A-Z][A-Z_]*$/);
    }
  });

  it("names an encrypted PDF in words", () => {
    expect(getToolFormatLabel(t, "PDF_ENCRYPTED")).toBe(
      "a password-protected PDF",
    );
  });

  it("joins alternatives the way the language does", () => {
    const formats: ToolFormat[] = ["PDF", "IMAGE"];
    expect(getToolFormatListLabel(t, "en-US", formats)).toBe("a PDF or images");
  });

  it("renders a single format without a conjunction", () => {
    expect(getToolFormatListLabel(t, "en-US", ["PDF"])).toBe("a PDF");
  });
});
