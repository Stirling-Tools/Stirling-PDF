/**
 * Turns an existing or drawn field into new-field definitions, for copy/paste and duplication.
 */
import { applyStagedGeometry } from "@editor/tools/formFill/formCoordinateUtils";
import type {
  FormField,
  ModifyFieldDefinition,
  NewFieldDefinition,
} from "@editor/tools/formFill/types";

export type FieldTemplate = Omit<NewFieldDefinition, "name"> & {
  name?: string;
};

/** Enough offset that a copy is visibly its own field rather than hiding the original. */
export const COPY_OFFSET_PT = 12;

/**
 * A committed field, staged edits included, as a definition the add-fields API accepts.
 * Null when the field has no widget whose position can be expressed in that API's space.
 */
export function templateFromField(
  field: FormField,
  staged?: ModifyFieldDefinition,
): FieldTemplate | null {
  const effective = staged ? applyStagedGeometry(field, staged) : field;
  const widgets = effective.widgets ?? [];
  const anchor = widgets[0];
  if (!anchor || anchor.cropBoxHeight == null) return null;

  // A radio group is created as one box its options are laid out in, so rebuild that box.
  const boxWidgets =
    effective.type === "radio"
      ? widgets.filter((w) => w.pageIndex === anchor.pageIndex)
      : [anchor];
  const left = Math.min(...boxWidgets.map((w) => w.x));
  const top = Math.min(...boxWidgets.map((w) => w.y));
  const right = Math.max(...boxWidgets.map((w) => w.x + w.width));
  const bottom = Math.max(...boxWidgets.map((w) => w.y + w.height));

  return {
    name: staged?.name ?? field.name,
    label: staged?.label ?? field.label,
    type: effective.type,
    pageIndex: anchor.pageIndex,
    x: left,
    y: anchor.cropBoxHeight - bottom,
    width: right - left,
    height: bottom - top,
    required: staged?.required ?? field.required,
    multiSelect: staged?.multiSelect ?? field.multiSelect,
    options: effective.options ?? undefined,
    // field.value is what has been filled in, not a default, so a copy starts empty.
    defaultValue: staged?.defaultValue,
    tooltip: staged?.tooltip ?? field.tooltip ?? undefined,
    fontSize: staged?.fontSize ?? anchor.fontSize,
    readOnly: effective.readOnly,
    multiline: effective.multiline,
    // Key presence, not value: a staged clear must not fall back to the original.
    maxLength:
      staged && "maxLength" in staged
        ? staged.maxLength
        : (field.maxLength ?? undefined),
    buttonAction:
      staged && "buttonAction" in staged
        ? staged.buttonAction
        : (field.buttonActionSpec ?? undefined),
    optionGap: staged?.optionGap ?? field.optionGap,
    optionSize: staged?.optionSize ?? field.optionSize,
  };
}

const COPY_SUFFIX = /_copy\d+$/;

/**
 * The name copies are numbered from. Last segment only, because a new field cannot contain '.',
 * which PDF reserves for hierarchy; and without a copy suffix, so copying a copy continues the
 * sequence instead of nesting it.
 */
function copyBase(name: string | undefined): string {
  const partial = name?.split(".").pop()?.trim().replace(COPY_SUFFIX, "");
  return partial || "Field";
}

/** `<base>_copy1`, `_copy2`, ... skipping any already taken. */
function copyNames(base: string, count: number, taken: Set<string>): string[] {
  const names: string[] = [];
  for (let n = 1; names.length < count; n++) {
    const candidate = `${base}_copy${n}`;
    if (!taken.has(candidate)) names.push(candidate);
  }
  return names;
}

/** Every name in use, applied or staged, so a copy's name is unique before the backend sees it. */
export function takenFieldNames(
  fields: FormField[],
  pending: { name: string }[],
  modified: Record<string, ModifyFieldDefinition>,
): Set<string> {
  return new Set([
    ...fields.map((f) => f.name),
    ...pending.map((f) => f.name),
    ...Object.values(modified).flatMap((m) => (m.name ? [m.name] : [])),
  ]);
}

/**
 * Name and label for each copy, numbered alike. The editor lists fields by label, so a copy
 * that kept the source's label would be indistinguishable from it.
 */
function copyIdentities(
  source: FieldTemplate,
  count: number,
  taken: Set<string>,
): { name: string; label: string }[] {
  const base = copyBase(source.name);
  const labelBase = source.label?.trim().replace(COPY_SUFFIX, "") || base;
  return copyNames(base, count, taken).map((name) => ({
    name,
    label: labelBase + name.slice(base.length),
  }));
}

/** One copy beside the source. */
export function duplicateInPlace(
  source: FieldTemplate,
  taken: Set<string>,
): FieldTemplate {
  const [identity] = copyIdentities(source, 1, taken);
  return {
    ...source,
    ...identity,
    x: source.x + COPY_OFFSET_PT,
    y: source.y - COPY_OFFSET_PT,
  };
}

/**
 * One copy at the same position on every other page. Each is its own field: sharing a name
 * would tie their values together, which is a separate choice from repeating the layout.
 */
export function duplicateToAllPages(
  source: FieldTemplate,
  totalPages: number,
  taken: Set<string>,
): FieldTemplate[] {
  const pages: number[] = [];
  for (let page = 0; page < totalPages; page++) {
    if (page !== source.pageIndex) pages.push(page);
  }
  const identities = copyIdentities(source, pages.length, taken);
  return pages.map((page, i) => ({
    ...source,
    ...identities[i],
    pageIndex: page,
  }));
}
