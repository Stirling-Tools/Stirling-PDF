/**
 * What an artifact is (ISO 32000-2 14.8.2.2.2): its /Type and /Subtype, as
 * names without the slash.
 */
export interface ArtifactKind {
  type: string;
  subtype: string | null;
}

/**
 * The page furniture text can be marked as: pagination artifacts, by their
 * /Subtype. PageNum is PDF 2.0's; ISO 32000-2 allows a PDF 1.7 file
 * subtypes beyond its own.
 */
export const FURNITURE = ["Header", "Footer", "PageNum", "Watermark"] as const;
export type Furniture = (typeof FURNITURE)[number];

export function furnitureKind(furniture: Furniture): ArtifactKind {
  return { type: "Pagination", subtype: furniture };
}

/** The furniture an artifact of `kind` is; null for any other artifact. */
export function furnitureOf(kind: ArtifactKind | undefined): Furniture | null {
  if (kind?.type !== "Pagination") return null;
  return FURNITURE.find((furniture) => furniture === kind.subtype) ?? null;
}
