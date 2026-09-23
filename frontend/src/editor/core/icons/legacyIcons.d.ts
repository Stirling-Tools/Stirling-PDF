/** Shape of `virtual:legacy-icons`; delete with IconAudit.stories.tsx. */
declare module "virtual:legacy-icons" {
  interface LegacyGlyph {
    viewBox: string;
    body: string;
  }
  const glyphs: {
    mui: Record<string, LegacyGlyph>;
    materialSymbols: Record<string, LegacyGlyph>;
  };
  export default glyphs;
}
