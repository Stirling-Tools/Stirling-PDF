/**
 * The variables an operator can reference in an integration step, as data.
 *
 * One catalogue drives both the reference panel and the `{{` autocomplete, so the list the
 * operator reads and the list the editor offers can never drift apart. The shape mirrors what the
 * backend actually resolves - `DocumentContext` for document/run scope, the executor's step
 * reports for `steps.N` - and nothing else, because offering a variable the server would reject
 * teaches the operator the system lies.
 */

const PREFIX = "portal.policies.variables";

export interface VariableDef {
  /** The dotted path as typed inside braces, e.g. "document.filename". */
  path: string;
  descKey: string;
  /** True when the path contains a part the operator must edit (the N in steps.N). */
  template?: boolean;
}

export interface VariableGroup {
  id: "document" | "run" | "classification" | "sensitivityLabel" | "steps";
  labelKey: string;
  descKey: string;
  variables: VariableDef[];
  /**
   * A worked example shown as such, distinct from the variable rows. This is where a
   * vendor-specific path (Nextcloud's ocs.data.url) is taught without being listed as a variable
   * that always exists - listed, it would fail every run where step N is a different vendor.
   */
  example?: { path: string; descKey: string };
}

const v = (path: string, template = false): VariableDef => ({
  path,
  descKey: `${PREFIX}.defs.${path.replaceAll(".", "_")}`,
  template,
});

/** Grouped for the reference panel; flattened for the autocomplete. */
export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    id: "document",
    labelKey: `${PREFIX}.groups.document.label`,
    descKey: `${PREFIX}.groups.document.description`,
    variables: [
      v("document.filename"),
      v("document.extension"),
      v("document.contentType"),
      v("document.sizeBytes"),
      v("document.sha256"),
      v("document.base64"),
      v("document.pageCount"),
      v("document.encrypted"),
      v("document.title"),
      v("document.author"),
      v("document.subject"),
      v("document.keywords"),
      v("document.creator"),
      v("document.producer"),
      v("document.created"),
      v("document.modified"),
    ],
  },
  {
    id: "run",
    labelKey: `${PREFIX}.groups.run.label`,
    descKey: `${PREFIX}.groups.run.description`,
    variables: [v("run.policyName"), v("run.runId"), v("run.timestamp")],
  },
  {
    id: "classification",
    labelKey: `${PREFIX}.groups.classification.label`,
    descKey: `${PREFIX}.groups.classification.description`,
    variables: [v("classification.label"), v("classification")],
  },
  {
    id: "sensitivityLabel",
    labelKey: `${PREFIX}.groups.sensitivityLabel.label`,
    descKey: `${PREFIX}.groups.sensitivityLabel.description`,
    variables: [
      v("sensitivityLabel.name"),
      v("sensitivityLabel.labelId"),
      v("sensitivityLabel.protected"),
    ],
  },
  {
    id: "steps",
    labelKey: `${PREFIX}.groups.steps.label`,
    descKey: `${PREFIX}.groups.steps.description`,
    // Only the two shapes every step report actually has; the worked example below teaches
    // reaching deeper. N is the 1-based position of the earlier step whose answer is wanted.
    variables: [v("steps.1.body", true), v("steps.1.status", true)],
    example: {
      path: "steps.1.body.ocs.data.url",
      descKey: `${PREFIX}.groups.steps.example`,
    },
  },
];

export const ALL_VARIABLES: VariableDef[] = VARIABLE_GROUPS.flatMap(
  (group) => group.variables,
);

/**
 * Which conditional scopes this team can actually use. Document, run and steps are always real;
 * classification only resolves where a classification policy runs, and sensitivityLabel only
 * where Purview is connected - offering either to a team without them is teaching a variable
 * that will fail their runs.
 */
export interface VariableAvailability {
  classification: boolean;
  sensitivityLabel: boolean;
}

/** The groups to offer; undefined availability (still loading, or unknowable) offers everything. */
export function variableGroupsFor(
  availability: VariableAvailability | undefined,
): VariableGroup[] {
  if (!availability) return VARIABLE_GROUPS;
  return VARIABLE_GROUPS.filter((group) =>
    group.id === "classification"
      ? availability.classification
      : group.id === "sensitivityLabel"
        ? availability.sensitivityLabel
        : true,
  );
}

/**
 * The variables matching what the operator has typed after `{{`.
 *
 * A plain prefix/substring match on the path: typing "file" finds document.filename, typing
 * "steps" finds the cross-step patterns. Dots count as normal characters so "document.s" narrows
 * to sha256/sizeBytes/subject.
 */
export function variableSuggestions(
  partial: string,
  groups: VariableGroup[] = VARIABLE_GROUPS,
): VariableDef[] {
  const all = groups.flatMap((group) => group.variables);
  const q = partial.trim().toLowerCase();
  if (q === "") return all;
  return all.filter((def) => def.path.toLowerCase().includes(q));
}

/**
 * Where an open `{{` reference starts in `text` before `cursor`, or null when the cursor is not
 * inside one. Closed references ({{a}}) and a brace pair with a space don't count; the partial may
 * only be path characters, so ordinary prose with braces never opens the menu.
 */
export function openReferenceAt(
  text: string,
  cursor: number,
): { start: number; partial: string } | null {
  const before = text.slice(0, cursor);
  const open = before.lastIndexOf("{{");
  if (open < 0) return null;
  const partial = before.slice(open + 2);
  if (partial.includes("}}")) return null;
  if (!/^[\w.]*$/.test(partial)) return null;
  return { start: open, partial };
}

/**
 * `text` with the open reference at `start` replaced by the chosen variable, closed. When the
 * characters right after the cursor already close the braces, they are reused rather than doubled.
 */
export function insertVariable(
  text: string,
  cursor: number,
  start: number,
  path: string,
): { text: string; cursor: number } {
  const after = text.slice(cursor);
  const closing = after.startsWith("}}") ? after.slice(2) : after;
  const inserted = `{{${path}}}`;
  return {
    text: text.slice(0, start) + inserted + closing,
    cursor: start + inserted.length,
  };
}
