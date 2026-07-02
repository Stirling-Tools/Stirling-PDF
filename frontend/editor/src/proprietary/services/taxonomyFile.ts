/**
 * Client-side import/export + validation for a classification taxonomy JSON file.
 * Sharing a taxonomy between teams is done by exporting the JSON here and
 * importing it on another team. Validation mirrors the backend
 * (`TaxonomyValidator`) so a malformed file is caught before it's uploaded — the
 * backend re-validates as the authority.
 */

import { downloadJsonAsFile } from "@app/utils/downloadUtils";
import type {
  ClassificationTaxonomy,
  DocumentCategory,
  DocumentType,
} from "@app/data/classificationTaxonomy";

// Kept in sync with the backend TaxonomyValidator (the authority); enforced here
// too so an oversized import is rejected before upload.
const MAX_CATEGORIES = 200;
const MAX_DOC_TYPES_PER_CATEGORY = 200;
const MAX_TAGS = 500;
const MAX_TEXT_LENGTH = 128;

/** Human-readable problems with a candidate taxonomy; empty means valid. */
export function validateTaxonomy(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return ["File is not a taxonomy object."];
  }
  const taxonomy = value as Partial<ClassificationTaxonomy>;
  if (!Array.isArray(taxonomy.categories) || taxonomy.categories.length === 0) {
    errors.push("Taxonomy must have at least one category.");
    return errors;
  }
  if (taxonomy.categories.length > MAX_CATEGORIES) {
    errors.push(`Too many categories (max ${MAX_CATEGORIES}).`);
  }
  if (Array.isArray(taxonomy.tags) && taxonomy.tags.length > MAX_TAGS) {
    errors.push(`Too many tags (max ${MAX_TAGS}).`);
  }
  const categoryIds = new Set<string>();
  for (const category of taxonomy.categories) {
    if (!isText(category?.id) || !isText(category?.label)) {
      errors.push("Every category needs a non-empty id and label.");
      continue;
    }
    if (!withinLength(category.id) || !withinLength(category.label)) {
      errors.push(
        `Category "${category.label}" has text over ${MAX_TEXT_LENGTH} characters.`,
      );
    }
    if ((category.docTypes ?? []).length > MAX_DOC_TYPES_PER_CATEGORY) {
      errors.push(
        `Too many sub-categories in "${category.label}" (max ${MAX_DOC_TYPES_PER_CATEGORY}).`,
      );
    }
    if (categoryIds.has(category.id)) {
      errors.push(`Duplicate category id: ${category.id}`);
    }
    categoryIds.add(category.id);
    const docTypeIds = new Set<string>();
    for (const docType of category.docTypes ?? []) {
      if (!isText(docType?.id) || !isText(docType?.label)) {
        errors.push(
          `Every sub-category in "${category.label}" needs an id and label.`,
        );
        continue;
      }
      if (!withinLength(docType.id) || !withinLength(docType.label)) {
        errors.push(
          `Sub-category "${docType.label}" has text over ${MAX_TEXT_LENGTH} characters.`,
        );
      }
      if (docTypeIds.has(docType.id)) {
        errors.push(
          `Duplicate sub-category id "${docType.id}" in "${category.label}".`,
        );
      }
      docTypeIds.add(docType.id);
    }
  }
  if (taxonomy.tags !== undefined) {
    if (!Array.isArray(taxonomy.tags)) {
      errors.push("Tags must be a list.");
    } else {
      const tags = new Set<string>();
      for (const tag of taxonomy.tags) {
        if (!isText(tag)) errors.push("Tags must be non-empty text.");
        else if (!withinLength(tag))
          errors.push(`Tag "${tag}" is over ${MAX_TEXT_LENGTH} characters.`);
        else if (tags.has(tag)) errors.push(`Duplicate tag: ${tag}`);
        else tags.add(tag);
      }
    }
  }
  return errors;
}

/** Coerce a validated value into a normalized taxonomy (trims, drops extras). */
export function normalizeTaxonomy(
  value: ClassificationTaxonomy,
): ClassificationTaxonomy {
  return {
    categories: value.categories.map(
      (c): DocumentCategory => ({
        id: c.id,
        label: c.label,
        docTypes: (c.docTypes ?? []).map(
          (d): DocumentType => ({ id: d.id, label: d.label }),
        ),
      }),
    ),
    tags: value.tags ?? [],
  };
}

/** Parse + validate a picked file, resolving to a normalized taxonomy. */
export async function parseTaxonomyFile(
  file: File,
): Promise<ClassificationTaxonomy> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const errors = validateTaxonomy(parsed);
  if (errors.length > 0) throw new Error(errors[0]);
  return normalizeTaxonomy(parsed as ClassificationTaxonomy);
}

/** Trigger a download of the taxonomy as a pretty-printed JSON file. */
export function downloadTaxonomy(
  taxonomy: ClassificationTaxonomy,
  fileName = "classification-taxonomy.json",
): void {
  downloadJsonAsFile(taxonomy, fileName);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function withinLength(value: string): boolean {
  return value.length <= MAX_TEXT_LENGTH;
}
