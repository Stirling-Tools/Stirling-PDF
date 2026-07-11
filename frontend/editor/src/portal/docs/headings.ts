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

/** "How it Works!" → "how-it-works" (matches the rendered heading id). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Extract H2/H3 headings from a doc body, skipping fenced code blocks. */
export function extractHeadings(markdown: string): Heading[] {
  const noCode = markdown.replace(/^(```|~~~)[\s\S]*?^\1[ \t]*$/gm, "");
  const headings: Heading[] = [];
  for (const m of noCode.matchAll(/^(#{2,3})[ \t]+(.+?)[ \t]*#*$/gm)) {
    const text = m[2].replace(/[`*_]/g, "").trim();
    if (text) headings.push({ level: m[1].length, text, slug: slugify(text) });
  }
  return headings;
}
