/** Shape of `virtual:legacy-icons`, served by legacyIcons.vite.mjs from the icon
 * packages at build time. Delete with IconAudit.stories.tsx. */
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
