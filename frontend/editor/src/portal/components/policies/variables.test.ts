import { describe, expect, it } from "vitest";

import {
  ALL_VARIABLES,
  VARIABLE_GROUPS,
  insertVariable,
  openReferenceAt,
  variableGroupsFor,
  variableSuggestions,
} from "@portal/components/policies/variables";

describe("openReferenceAt", () => {
  it("finds the open reference the cursor is inside", () => {
    const text = "see {{doc";
    expect(openReferenceAt(text, text.length)).toEqual({
      start: 4,
      partial: "doc",
    });
  });

  it("is closed the moment the braces are", () => {
    const text = "see {{document.filename}} now";
    expect(openReferenceAt(text, text.length)).toBeNull();
  });

  it("ignores braces followed by prose - typing text is not typing a reference", () => {
    const text = "a {{ b c";
    expect(openReferenceAt(text, text.length)).toBeNull();
  });

  it("opens fresh after a completed reference", () => {
    const text = "{{run.runId}} and {{ste";
    expect(openReferenceAt(text, text.length)).toEqual({
      start: 18,
      partial: "ste",
    });
  });

  it("returns null with no braces at all", () => {
    expect(openReferenceAt("plain text", 5)).toBeNull();
  });
});

describe("insertVariable", () => {
  it("completes the partial reference at the cursor", () => {
    const text = "see {{doc after";
    const result = insertVariable(text, 9, 4, "document.filename");
    expect(result.text).toBe("see {{document.filename}} after");
    expect(result.cursor).toBe("see {{document.filename}}".length);
  });

  it("reuses closing braces already sitting after the cursor", () => {
    const text = "see {{doc}}";
    const result = insertVariable(text, 9, 4, "document.filename");
    expect(result.text).toBe("see {{document.filename}}");
  });
});

describe("variableSuggestions", () => {
  it("matches anywhere in the path", () => {
    const hits = variableSuggestions("filename").map((d) => d.path);
    expect(hits).toContain("document.filename");
  });

  it("narrows by dotted prefix", () => {
    const hits = variableSuggestions("document.s").map((d) => d.path);
    expect(hits).toContain("document.sha256");
    expect(hits).toContain("document.sizeBytes");
    expect(hits).not.toContain("document.filename");
  });

  it("offers the cross-step patterns under steps", () => {
    const hits = variableSuggestions("steps").map((d) => d.path);
    expect(hits).toContain("steps.1.body");
    expect(hits).toContain("steps.1.status");
    // The vendor-specific path is a worked example, not a variable that always exists.
    expect(hits).not.toContain("steps.1.body.ocs.data.url");
  });

  it("offers everything for an empty partial", () => {
    expect(variableSuggestions("")).toHaveLength(ALL_VARIABLES.length);
  });

  it("suggests only from the groups it is given", () => {
    const withoutConditionals = variableGroupsFor({
      classification: false,
      sensitivityLabel: false,
    });
    const hits = variableSuggestions("", withoutConditionals).map(
      (d) => d.path,
    );
    expect(hits).toContain("document.filename");
    expect(hits.some((p) => p.startsWith("classification"))).toBe(false);
    expect(hits.some((p) => p.startsWith("sensitivityLabel"))).toBe(false);
  });
});

describe("variableGroupsFor", () => {
  it("offers everything while availability is unknown", () => {
    expect(variableGroupsFor(undefined)).toHaveLength(VARIABLE_GROUPS.length);
  });

  it("drops only the scopes the team does not have", () => {
    const ids = variableGroupsFor({
      classification: true,
      sensitivityLabel: false,
    }).map((g) => g.id);
    expect(ids).toContain("classification");
    expect(ids).not.toContain("sensitivityLabel");
    expect(ids).toEqual(expect.arrayContaining(["document", "run", "steps"]));
  });
});
