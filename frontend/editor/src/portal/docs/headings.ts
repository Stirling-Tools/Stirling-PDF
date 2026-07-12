/**
 * Heading extraction for the "On this page" table of contents. The same
 * `slugify` is used here and in MarkdownDoc's heading renderer, so the TOC links
 * and the rendered heading ids always match.
 */

export interface Heading {
  /** 2 or 3 (H2/H3). */
  level: number;
  text: string;
  slug: string;
}

/** "How it Works!" → "how-it-works" (the base id, before de-duplication). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A stateful slugger that de-duplicates: repeated heading text gets `-1`, `-2`, …
 * The TOC extraction and MarkdownDoc's heading renderer each make one and feed it
 * headings in document order, so their slugs (and thus link ↔ id) always match.
 */
export function makeSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

/** Extract H2/H3 headings from a doc body, skipping fenced code blocks. */
export function extractHeadings(markdown: string): Heading[] {
  const noCode = markdown.replace(/^(```|~~~)[\s\S]*?^\1[ \t]*$/gm, "");
  const slug = makeSlugger();
  const headings: Heading[] = [];
  for (const m of noCode.matchAll(/^ {0,3}(#{2,3})[ \t]+(.+?)[ \t]*#*$/gm)) {
    const text = m[2].replace(/[`*_]/g, "").trim();
    if (text) headings.push({ level: m[1].length, text, slug: slug(text) });
  }
  return headings;
}
