import { BrandMark } from "@portal/components/BrandMarks";

/**
 * Source-type mark for the sources table and pickers: the connector's real
 * brand mark (full colour, no tinted plate), falling back to neutral
 * currentColor glyphs for generic types. Keyed by the backend source `type`;
 * unknown types get a neutral document/plug mark via BrandMark's fallback.
 */
export function SourceTypeIcon({ type }: { type: string }) {
  return <BrandMark id={type} className="portal-sources__type-svg" />;
}
