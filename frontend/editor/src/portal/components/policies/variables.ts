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
  /** The name an operator reads, e.g. "File name". Use variableLabel to resolve it. */
  labelKey: string;
  descKey: string;
  /** True when the path contains a part the operator must edit (the N in steps.N). */
  template?: boolean;
  /** True when the value is JSON a dotted path may reach inside (classification, steps.N.body). */
  deep?: boolean;
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
  labelKey: `${PREFIX}.labels.${path.replaceAll(".", "_")}`,
  descKey: `${PREFIX}.defs.${path.replaceAll(".", "_")}`,
  template,
});

/** A steps.N def: the name and description are shared across every N, so both are set here. */
const stepVar = (n: number | string, kind: "body" | "status"): VariableDef => ({
  path: `steps.${n}.${kind}`,
  labelKey: `${PREFIX}.labels.steps_${kind}`,
  descKey: `${PREFIX}.defs.steps_${kind}`,
  template: typeof n === "string",
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
    // classification is the verdict's whole JSON, so dotted paths may reach inside it.
    variables: [
      v("classification.label"),
      { ...v("classification"), deep: true },
    ],
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
    // This generic form is offered only when the step's own position is unknown - when it is
    // known, variableGroupsFor swaps in one concrete pair per earlier step.
    variables: [stepVar("1", "body"), stepVar("1", "status")],
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

/**
 * The groups to offer; undefined availability (still loading, or unknowable) offers everything.
 *
 * `stepPosition` is the configured step's own 1-based place in the chain. With it known, the
 * steps group offers one concrete pair per *earlier* step - and nothing at all for step 1 -
 * because the only alternative is a steps.1 template that, accepted verbatim in step 1, is a
 * self-reference the backend rightly fails every run on.
 */
export function variableGroupsFor(
  availability: VariableAvailability | undefined,
  stepPosition?: number,
): VariableGroup[] {
  const groups = VARIABLE_GROUPS.filter((group) =>
    group.id === "classification"
      ? (availability?.classification ?? true)
      : group.id === "sensitivityLabel"
        ? (availability?.sensitivityLabel ?? true)
        : true,
  );
  if (stepPosition === undefined) return groups;
  return groups.flatMap((group) => {
    if (group.id !== "steps") return [group];
    if (stepPosition <= 1) return [];
    const variables: VariableDef[] = [];
    for (let n = 1; n < stepPosition; n++) {
      variables.push(stepVar(n, "body"), stepVar(n, "status"));
    }
    return [{ ...group, variables }];
  });
}

/**
 * The `{{references}}` in `text` that name nothing the run can substitute, deduplicated.
 *
 * The backend hard-fails an unknown path at run time, so a typo saved today fails every run
 * tomorrow; this is the save-time check that catches it while the fix is one keystroke away.
 * Matches the backend's tolerance for spaces inside the braces. steps.N references are valid
 * for any earlier step (N below `stepPosition` when the position is known); `deep` variables
 * (classification, steps.N.body) accept dotted paths reaching inside their JSON.
 */
export function unknownReferences(
  text: string,
  groups: VariableGroup[] = VARIABLE_GROUPS,
  stepPosition?: number,
): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const path = match[1];
    if (!referenceValid(path, groups, stepPosition)) out.add(path);
  }
  return [...out];
}

function referenceValid(
  path: string,
  groups: VariableGroup[],
  stepPosition?: number,
): boolean {
  const step = /^steps\.(\d+)\.(?:body(?:\.\w+)*|status)$/.exec(path);
  if (step) {
    if (!groups.some((group) => group.id === "steps")) return false;
    const n = Number(step[1]);
    return n >= 1 && (stepPosition === undefined || n < stepPosition);
  }
  return groups.some((group) =>
    group.variables.some(
      (def) =>
        def.path === path || (def.deep && path.startsWith(def.path + ".")),
    ),
  );
}

/** Translate function shape, narrowed to what this module needs. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The name to show for a variable, e.g. "File name" or "Full response from step 2".
 *
 * The field draws this instead of the path, because a dotted path is a location and an operator
 * is choosing a thing. A steps.N variable carries its step number, since that is the part of the
 * path that actually carries meaning - it is the dependency on an earlier step.
 */
export function variableLabel(def: VariableDef, t: Translate): string {
  const base = t(def.labelKey);
  const step = /^steps\.(\d+)\./.exec(def.path);
  return step ? t(`${PREFIX}.fromStep`, { label: base, n: step[1] }) : base;
}

/** The catalogued definition for a saved path, or undefined for one we ship no name for. */
export function defForPath(
  path: string,
  groups: VariableGroup[] = VARIABLE_GROUPS,
): VariableDef | undefined {
  return groups
    .flatMap((group) => group.variables)
    .find((def) => def.path === path);
}

/**
 * The variables matching what the operator has typed after a trigger.
 *
 * Matches the name as well as the path, because the name is now what the list shows: typing
 * "link" has to find the share link even though its path says "ocs.data.url". Dots count as
 * normal characters, so "document.s" still narrows to sha256/sizeBytes/subject.
 */
export function variableSuggestions(
  partial: string,
  groups: VariableGroup[] = VARIABLE_GROUPS,
  t?: Translate,
): VariableDef[] {
  const all = groups.flatMap((group) => group.variables);
  const q = partial.trim().toLowerCase();
  if (q === "") return all;
  return all.filter(
    (def) =>
      def.path.toLowerCase().includes(q) ||
      (t !== undefined && variableLabel(def, t).toLowerCase().includes(q)),
  );
}

/**
 * The characters that open the variable list. `@` and `/` are the ones we teach - one unshifted
 * key, borrowed from every chat app - and `{{` is kept so anyone who learned the old syntax keeps
 * their habit and still never ends up with raw braces on screen.
 */
const TRIGGER = /(?:^|[\s\n])(@|\/|\{\{)([\w.]*)$/;

/**
 * Where an open reference starts in `text` before `cursor`, or null when the cursor is not in one.
 *
 * A trigger only counts at the start of a word - the beginning of the field, or straight after a
 * space or newline - so `bob@acme.com` and `and/or` are ordinary text, which matters because these
 * are exactly the fields people type addresses and paths into. The partial may only be path
 * characters, so prose after a trigger closes the list rather than hijacking the sentence.
 */
export function openReferenceAt(
  text: string,
  cursor: number,
): { start: number; partial: string } | null {
  const before = text.slice(0, cursor);
  const match = TRIGGER.exec(before);
  if (!match) return null;
  return {
    start: before.length - (match[1].length + match[2].length),
    partial: match[2],
  };
}
