// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { readAcroFormFieldInfo } from "@editor/tools/formFill/providers/acroFormFieldInfo";

const fixtureBytes = (name: string): ArrayBuffer => {
  const bytes = readFileSync(
    path.join(import.meta.dirname, "../../../tests/test-fixtures", name),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

describe("readAcroFormFieldInfo", () => {
  it("separates [export, display] option pairs from plain options", async () => {
    const info = await readAcroFormFieldInfo(
      fixtureBytes("form-options-sample.pdf"),
    );

    const choice = info.get("choice_1");
    expect(choice?.exportValues).toEqual(["one-value", "two-value", "plain"]);
    expect(choice?.displayValues).toEqual(["one-value", "Two Label", "plain"]);
  });

  it("reads push button labels and every action shape", async () => {
    const info = await readAcroFormFieldInfo(
      fixtureBytes("form-options-sample.pdf"),
    );

    expect(info.get("push_uri")).toEqual({
      label: "Ship it",
      action: { type: "uri", url: "https://example.com/go" },
    });
    expect(info.get("push_js")?.action).toEqual({
      type: "javascript",
      javascript: "app.alert('hi')",
    });
    expect(info.get("push_named")?.action).toEqual({
      type: "named",
      namedAction: "Print",
    });
    expect(info.get("push_additional")?.action).toEqual({
      type: "uri",
      url: "https://example.com/up",
    });
    expect(info.get("push_submit")?.action).toEqual({
      type: "submitForm",
      url: "https://example.com/post",
      submitFlags: 4,
    });
  });

  it("returns an empty map for a form-less document", async () => {
    const info = await readAcroFormFieldInfo(fixtureBytes("big-sample.pdf"));

    expect(info.size).toBe(0);
  });
});
