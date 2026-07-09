/**
 * Client-side import/export + validation for a classification-labels JSON file
 * (`{"labels":[{"id":"invoice","name":"Invoice","icon":"receipt-long"}, …]}`).
 * Sharing a label set between teams is done by exporting the JSON here and
 * importing it on another team. Validation mirrors the backend
 * (`LabelsValidator`) so a malformed file is caught before it's uploaded — the
 * backend re-validates as the authority. A file may omit `id` (e.g. an older
 * export); it is then derived from the name.
 */

import { downloadJsonAsFile } from "@app/utils/downloadUtils";
import { LABEL_ICON_KEYS } from "@app/data/labelIcons";
import {
  labelId,
  type ClassificationLabel,
} from "@app/data/classificationLabels";

// Kept in sync with the backend LabelsValidator (the authority); enforced here
// too so an oversized import is rejected before upload.
const MAX_LABELS = 500;
const MAX_TEXT_LENGTH = 128;

interface LabelsFileShape {
  labels: ClassificationLabel[];
}

/** A label's effective id: the provided one, else derived from the name. */
function effectiveId(label: Partial<ClassificationLabel>): string {
  const provided = typeof label.id === "string" ? label.id.trim() : "";
  return provided || labelId(label.name?.trim() ?? "");
}

/** Human-readable problems with a candidate labels file; empty means valid. */
export function validateLabels(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return ["File is not a labels object."];
  }
  const { labels } = value as Partial<LabelsFileShape>;
  if (!Array.isArray(labels)) {
    return ['File must have a "labels" list.'];
  }
  if (labels.length > MAX_LABELS) {
    errors.push(`Too many labels (max ${MAX_LABELS}).`);
  }
  const seenIds = new Set<string>();
  for (const label of labels) {
    if (!isText(label?.name)) {
      errors.push("Every label needs a non-empty name.");
      continue;
    }
    const name = label.name.trim();
    if (name.length > MAX_TEXT_LENGTH) {
      errors.push(`Label "${name}" is over ${MAX_TEXT_LENGTH} characters.`);
    }
    const id = effectiveId(label);
    if (!id) {
      errors.push(`Label "${name}" has no usable id.`);
      continue;
    }
    if (seenIds.has(id)) errors.push(`Duplicate label: ${name}`);
    seenIds.add(id);
  }
  return errors;
}

/** Coerce a validated value into a normalized label list (trims, drops extras). */
export function normalizeLabels(
  labels: ClassificationLabel[],
): ClassificationLabel[] {
  return labels.map((label): ClassificationLabel => {
    const name = label.name.trim();
    const id = effectiveId(label);
    // Keep the icon only if it's a known palette key, so a hand-crafted import
    // can't set an unbundled key that renders blank.
    return label.icon && LABEL_ICON_KEYS.has(label.icon)
      ? { id, name, icon: label.icon }
      : { id, name };
  });
}

/** Parse + validate a picked file, resolving to a normalized label list. */
export async function parseLabelsFile(
  file: File,
): Promise<ClassificationLabel[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const errors = validateLabels(parsed);
  if (errors.length > 0) throw new Error(errors[0]);
  return normalizeLabels((parsed as LabelsFileShape).labels);
}

/** Trigger a download of the labels as a pretty-printed JSON file. */
export function downloadLabels(
  labels: ClassificationLabel[],
  fileName = "classification-labels.json",
): void {
  downloadJsonAsFile({ labels }, fileName);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
