import { describe, expect, it } from "vitest";
import { Blob } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readFieldBundle } from "@app/tools/formFill/fieldBundle";

/**
 * Reads archives produced by the real backend (see FormFieldBundleTest), not by a JS lookalike.
 * Java defers the deflated entry's sizes to a data descriptor, so the local header reports zero.
 */

function fixture(name: string): Blob {
  return new Blob([
    readFileSync(join(import.meta.dirname, "__fixtures__", name)),
  ]);
}

describe("readFieldBundle against real backend output", () => {
  it("reads a mixed checkbox and radio form", async () => {
    const result = await readFieldBundle(fixture("checkbox-and-radio.zip"));

    expect(result).not.toBeNull();
    expect(result!.fields.map((field) => field.name).sort()).toEqual([
      "agree",
      "plan",
    ]);
    const pdf = new Uint8Array(await result!.pdf.arrayBuffer());
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
  });

  it("reads a 120-field document without truncating the pdf", async () => {
    const blob = fixture("many-fields.zip");

    const result = await readFieldBundle(blob);

    expect(result!.fields).toHaveLength(120);
    const pdf = new Uint8Array(await result!.pdf.arrayBuffer());
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    // The tail proves the stored slice ran to the entry's real end, not to the archive's.
    expect(new TextDecoder().decode(pdf.subarray(-6))).toContain("%%EOF");
    expect(pdf.length).toBeLessThan(blob.size);
  });

  it("carries widget coordinates through, which is why the second request can go", async () => {
    const result = await readFieldBundle(fixture("many-fields.zip"));

    const widget = result!.fields[0]?.widgets?.[0];
    expect(widget).toBeDefined();
    expect(typeof widget!.pageIndex).toBe("number");
    expect(typeof widget!.x).toBe("number");
    expect(typeof widget!.y).toBe("number");
  });
});
