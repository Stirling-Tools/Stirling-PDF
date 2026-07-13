// Default classification labels. The SOURCE OF TRUTH is the co-located static
// JSON (`classificationLabels.json`), imported here and shaped into typed
// objects — edit THAT file, not this one. This is the ONLY copy of the label
// data: it seeds a team's editable set and drives the sidebar's grouping,
// icons, and display names. Neither the backend nor the engine keeps a copy.
//
// NOTE: this is only the built-in default vocabulary. A team's own
// (admin-editable) labels live in the backend store and are what the backend
// sends to the engine per classify request — the engine holds no vocabulary of
// its own. Edits to a team's set reach Python on the next run, independent of
// this file.
//
// `labels` is the flat set: each has a stable `id` (slug — the value on the wire,
// in storage and keyed on) and a human `name` (display, translatable via
// `classification.labels.<id>`); `icon` is presentational only, the engine never
// sees it. `families` are presentational sidebar roll-ups (referencing labels by
// id) the classifier never sees.

import labelsData from "@app/data/classificationLabels.json";

export interface ClassificationLabel {
  /** Stable identity (slug) — the value on the wire, stored on the doc, and
   *  keyed on. Independent of the (translatable) display name. */
  id: string;
  /** Human display name; the en-US default for `classification.labels.<id>`. */
  name: string;
  /** Material Symbols icon key (see `labelIcons.ts`). */
  icon?: string;
}

export interface LabelFamily {
  /** Stable identity for sidebar prefs — never rename once shipped. */
  id: string;
  /** Group header text shown in the sidebar and the group picker. */
  name: string;
  /** Material Symbols icon key (see `labelIcons.ts`). */
  icon: string;
  /** The built-in labels this family rolls up in the sidebar. */
  labels: ClassificationLabel[];
}

/** Shape of `classificationLabels.json` — the flat label set plus the
 *  presentational family grouping (which references labels by id). */
interface LabelsFile {
  labels: ClassificationLabel[];
  families: { id: string; name: string; icon: string; labelIds: string[] }[];
}

const data = labelsData as LabelsFile;

/** Flat default label set — file order, as the classifier/team-seed sees it. */
export const DEFAULT_CLASSIFICATION_LABELS: ClassificationLabel[] = data.labels;

const LABEL_BY_ID = new Map(data.labels.map((label) => [label.id, label]));

/**
 * Built-in families with their labels resolved from the flat set by id. Throws
 * at module load if a family references an unknown id, so a bad hand-edit of the
 * JSON fails fast rather than silently dropping a label from its group.
 */
export const LABEL_FAMILIES: LabelFamily[] = data.families.map((family) => ({
  id: family.id,
  name: family.name,
  icon: family.icon,
  labels: family.labelIds.map((id) => {
    const label = LABEL_BY_ID.get(id);
    if (!label) {
      throw new Error(
        `Classification family "${family.id}" references unknown label id "${id}"`,
      );
    }
    return label;
  }),
}));

/**
 * Stable slug id from a label's canonical (English) name — used to derive an id
 * for a NEW custom label the user types. Built-in ids are authored in the JSON;
 * this must stay in sync with the slug rule used to generate them.
 */
export function labelId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
