/**
 * The standard structure types: ISO 32000-1 14.8.4, plus the types ISO
 * 32000-2 adds. A file may name others, which are only meaningful through a
 * /RoleMap entry mapping them to one of these.
 */
export const STANDARD_STRUCTURE_TYPES = [
  "Document",
  "DocumentFragment",
  "Part",
  "Art",
  "Sect",
  "Div",
  "Aside",
  "BlockQuote",
  "Caption",
  "TOC",
  "TOCI",
  "Index",
  "NonStruct",
  "Private",
  "Title",
  "FENote",
  "P",
  "H",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "L",
  "LI",
  "Lbl",
  "LBody",
  "Table",
  "TR",
  "TH",
  "TD",
  "THead",
  "TBody",
  "TFoot",
  "Span",
  "Quote",
  "Note",
  "Reference",
  "BibEntry",
  "Code",
  "Link",
  "Annot",
  "Ruby",
  "RB",
  "RT",
  "RP",
  "Warichu",
  "WT",
  "WP",
  "Em",
  "Strong",
  "Sub",
  "Figure",
  "Formula",
  "Form",
  "Artifact",
] as const;

export type StructureType = (typeof STANDARD_STRUCTURE_TYPES)[number];

const STANDARD = new Set<string>(STANDARD_STRUCTURE_TYPES);

export function isStandardStructureType(name: string): name is StructureType {
  return STANDARD.has(name);
}

/** What an element is tagged as. */
export interface StructureRole {
  /** The name /S resolves to through the /RoleMap: a standard type, or a custom role left unmapped. */
  role: string;
  /** `role` as a standard type; null for a custom role, whose meaning is unknown. */
  type: StructureType | null;
}

export function structureRole(role: string): StructureRole {
  return { role, type: isStandardStructureType(role) ? role : null };
}

export type HeadingType = "H" | "H1" | "H2" | "H3" | "H4" | "H5" | "H6";

const HEADING_LEVELS: Record<HeadingType, number | null> = {
  H: null,
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
};

export function isHeadingType(type: StructureType | null): type is HeadingType {
  return type !== null && Object.hasOwn(HEADING_LEVELS, type);
}

/** A numbered heading's level; null for H, whose level is its nesting. */
export function headingLevel(type: HeadingType): number | null {
  return HEADING_LEVELS[type];
}
