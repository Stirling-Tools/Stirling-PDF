import { describe, expect, it } from "vitest";

import {
  ALL_VARIABLES,
  VARIABLE_GROUPS,
  defForPath,
  openReferenceAt,
  unknownReferences,
  variableGroupsFor,
  variableLabel,
  variableSuggestions,
} from "@portal/components/policies/variables";

/** Stands in for i18next: labels come back readable, fromStep interpolates. */
const t = (key: string, options?: Record<string, unknown>) => {
  if (key.endsWith(".fromStep"))
    return `${options?.label} from step ${options?.n}`;
  return key.split(".").pop() ?? key;
};

describe("openReferenceAt", () => {
  it.each([
    ["@", "ping @doc", 5, "doc"],
    ["/", "note /run", 5, "run"],
    ["{{", "see {{doc", 4, "doc"],
  ])("opens on %s at a word start", (_trigger, text, start, partial) => {
    expect(openReferenceAt(text, text.length)).toEqual({ start, partial });
  });

  it("opens at the very start of the field", () => {
    expect(openReferenceAt("@doc", 4)).toEqual({ start: 0, partial: "doc" });
  });

  it.each([
    ["an email address", "mail bob@acme"],
    ["a path", "and/or"],
  ])("leaves a trigger inside %s alone", (_what, text) => {
    expect(openReferenceAt(text, text.length)).toBeNull();
  });

  it("is closed the moment the braces are", () => {
    const text = "see {{document.filename}} now";
    expect(openReferenceAt(text, text.length)).toBeNull();
  });

  it("ignores a trigger followed by prose - typing text is not typing a reference", () => {
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

  it("returns null with no trigger at all", () => {
    expect(openReferenceAt("plain text", 5)).toBeNull();
  });
});

describe("variableLabel", () => {
  it("names a plain variable", () => {
    expect(variableLabel(defForPath("document.filename")!, t)).toBe(
      "document_filename",
    );
  });

  it("carries the step number, because that is the dependency", () => {
    const def = variableGroupsFor(undefined, 3)
      .find((group) => group.id === "steps")!
      .variables.find((v) => v.path === "steps.2.body")!;
    expect(variableLabel(def, t)).toBe("steps_body from step 2");
  });
});

describe("defForPath", () => {
  it("finds a catalogued variable", () => {
    expect(defForPath("run.runId")?.path).toBe("run.runId");
  });

  it("has nothing for a path we ship no name for", () => {
    expect(defForPath("steps.1.body.ocs.data.url")).toBeUndefined();
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

  it("offers no steps group to step 1 - its only completion would be a self-reference", () => {
    const ids = variableGroupsFor(undefined, 1).map((g) => g.id);
    expect(ids).not.toContain("steps");
  });

  it("offers one concrete pair per earlier step, nothing at or past this one", () => {
    const steps = variableGroupsFor(undefined, 3).find(
      (g) => g.id === "steps",
    )!;
    expect(steps.variables.map((d) => d.path)).toEqual([
      "steps.1.body",
      "steps.1.status",
      "steps.2.body",
      "steps.2.status",
    ]);
    // Concrete paths: nothing left for the operator to edit before it resolves.
    expect(steps.variables.every((d) => !d.template)).toBe(true);
  });

  it("keeps the generic steps template when the position is unknown", () => {
    const steps = variableGroupsFor(undefined).find((g) => g.id === "steps")!;
    expect(steps.variables.map((d) => d.path)).toEqual([
      "steps.1.body",
      "steps.1.status",
    ]);
  });
});

describe("unknownReferences", () => {
  it("passes catalogue paths and flags typos", () => {
    expect(
      unknownReferences("{{document.filename}} at {{run.timestamp}}"),
    ).toEqual([]);
    expect(unknownReferences("{{document.flename}}")).toEqual([
      "document.flename",
    ]);
  });

  it("tolerates spaces inside the braces, like the backend resolver", () => {
    expect(unknownReferences("{{ document.filename }}")).toEqual([]);
  });

  it("allows dotted paths into deep variables only", () => {
    expect(unknownReferences("{{classification.confidence}}")).toEqual([]);
    // document.filename is a scalar; reaching inside it fails at run time.
    expect(unknownReferences("{{document.filename.x}}")).toEqual([
      "document.filename.x",
    ]);
  });

  it("accepts steps references only for steps that ran earlier", () => {
    expect(
      unknownReferences("{{steps.1.body.ocs.data.url}}", undefined, 2),
    ).toEqual([]);
    expect(unknownReferences("{{steps.1.status}}", undefined, 2)).toEqual([]);
    // The self- and forward references that fail every run.
    expect(unknownReferences("{{steps.2.body}}", undefined, 2)).toEqual([
      "steps.2.body",
    ]);
    expect(unknownReferences("{{steps.1.body}}", undefined, 1)).toEqual([
      "steps.1.body",
    ]);
  });

  it("accepts any step number when the position is unknown", () => {
    expect(unknownReferences("{{steps.7.body.url}}")).toEqual([]);
  });

  it("rejects steps shapes the executor cannot resolve", () => {
    expect(unknownReferences("{{steps.1.status.x}}", undefined, 2)).toEqual([
      "steps.1.status.x",
    ]);
    expect(unknownReferences("{{steps.1}}", undefined, 2)).toEqual(["steps.1"]);
  });

  it("ignores prose braces that are not references", () => {
    expect(unknownReferences("a {{ b c }} d")).toEqual([]);
  });

  it("honours the groups it is given", () => {
    const withoutConditionals = variableGroupsFor({
      classification: false,
      sensitivityLabel: false,
    });
    expect(
      unknownReferences("{{classification.label}}", withoutConditionals),
    ).toEqual(["classification.label"]);
  });
});
