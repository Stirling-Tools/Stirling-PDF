/**
 * Pure transforms that turn the Docusaurus docs repo into the portal docs
 * manifest. No I/O and no external deps so `tsx` (the sync CLI) and vitest can
 * both use it. The sync CLI does the fetching; this module does the shaping.
 *
 * The auto-sort rules:
 *   - every directory that directly holds markdown becomes a nav section,
 *     labelled + ordered by its `_category_.json` (root files → "Overview"),
 *   - each `.md`/`.mdx` file becomes a nav item, ordered by frontmatter
 *     `sidebar_position` then title,
 *   - Docusaurus MDX is normalised to plain GitHub-flavoured markdown that
 *     react-markdown can render (admonitions, JSX, relative links, images).
 */

/* ──────────────────────────────────────────────────────────────────────── */
/*  Manifest shape (mirrored structurally by @portal/api/docs)               */
/* ──────────────────────────────────────────────────────────────────────── */

export interface DocsNavItem {
  id: string;
  label: string;
  badge?: string;
}

export interface DocsNavSection {
  id: string;
  label: string;
  icon: string;
  items: DocsNavItem[];
}

export interface DocEntry {
  id: string;
  title: string;
  description?: string;
  section: string;
  markdown: string;
  sourcePath: string;
  editUrl: string;
}

export interface DocsManifest {
  source: { repo: string; ref: string; root: string };
  nav: DocsNavSection[];
  docs: Record<string, DocEntry>;
}

/** One markdown file read from the repo, before shaping. */
export interface RawDoc {
  /** Posix path relative to the docs root, e.g. "Configuration/OCR.md". */
  relPath: string;
  content: string;
}

/** `_category_.json` contents, keyed by posix dir path relative to docs root. */
export type CategoryMap = Record<string, { label?: string; position?: number }>;

export interface BuildOptions {
  repo: string;
  ref: string;
  /** Docs root within the repo, e.g. "docs". */
  root: string;
  /** Live docs site base, used as the fallback for unresolved internal links. */
  siteBaseUrl: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Small helpers                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

const SECTION_ICONS: Array<[RegExp, string]> = [
  [/overview|getting started|start/i, "▶"],
  [/config/i, "⚙"],
  [/function|tool|feature/i, "▤"],
  [/install|deploy/i, "⤓"],
  [/migrat|upgrade/i, "⇄"],
  [/security|sign|auth/i, "🛡"],
  [/convert/i, "⇋"],
  [/page/i, "▦"],
  [/api|develop/i, "{ }"],
];

/** A single-glyph icon for a section, chosen from its label. */
export function sectionIcon(label: string): string {
  for (const [re, glyph] of SECTION_ICONS) if (re.test(label)) return glyph;
  return "◇";
}

/** "Getting-Started_Guide" → "Getting Started Guide". */
export function humanize(name: string): string {
  return name
    .replace(/\.mdx?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Lowercase, hyphenated, url-safe id for a path segment. */
export function slugifySegment(name: string): string {
  return name
    .replace(/\.mdx?$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Docs-root-relative posix path → stable doc id, e.g. "configuration/ocr". */
export function docIdForPath(relPath: string): string {
  return relPath.split("/").map(slugifySegment).filter(Boolean).join("/");
}

/** Posix dirname ("" for a root-level file). */
export function dirOf(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? "" : relPath.slice(0, i);
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Frontmatter                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

export interface Frontmatter {
  data: Record<string, string | number>;
  body: string;
}

/** Split leading `--- ... ---` YAML frontmatter (scalar keys only) from body. */
export function parseFrontmatter(content: string): Frontmatter {
  const normalised = content.replace(/\r\n/g, "\n");
  if (!normalised.startsWith("---\n")) return { data: {}, body: normalised };
  const end = normalised.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: normalised };
  const raw = normalised.slice(4, end);
  const rest = normalised.slice(end + 4).replace(/^\n/, "");
  const data: Record<string, string | number> = {};
  for (const line of raw.split("\n")) {
    const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value: string | number = m[2].trim().replace(/^["']|["']$/g, "");
    if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
    data[m[1]] = value;
  }
  return { data, body: rest };
}

/** First `# H1` heading text in a body, if any. */
export function firstHeading(body: string): string | undefined {
  const m = /^#\s+(.+?)\s*$/m.exec(stripCodeFences(body));
  return m ? m[1].trim() : undefined;
}

/** Blank out fenced code blocks so heading/link scans ignore their contents. */
function stripCodeFences(md: string): string {
  return md.replace(/^(```|~~~)[\s\S]*?^\1\s*$/gm, "");
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Body normalisation (MDX → plain markdown)                                */
/* ──────────────────────────────────────────────────────────────────────── */

/** Run `fn` over the non-fenced-code spans of `md`, leaving code blocks intact. */
function mapOutsideCode(md: string, fn: (text: string) => string): string {
  const parts = md.split(/(^(?:```|~~~)[\s\S]*?^(?:```|~~~)\s*$)/gm);
  return parts.map((part, i) => (i % 2 === 0 ? fn(part) : part)).join("");
}

const ADMONITION_META: Record<string, { icon: string; label: string }> = {
  tip: { icon: "💡", label: "Tip" },
  note: { icon: "📝", label: "Note" },
  info: { icon: "ℹ️", label: "Info" },
  warning: { icon: "⚠️", label: "Warning" },
  caution: { icon: "⚠️", label: "Caution" },
  danger: { icon: "🚫", label: "Danger" },
};

/** `:::tip Title\n…\n:::` → a blockquote with a bold titled first line. */
export function convertAdmonitions(md: string): string {
  const re = /^:::(\w+)[ \t]*(.*)\n([\s\S]*?)^:::[ \t]*$/gm;
  return md.replace(re, (_all, type: string, title: string, body: string) => {
    const meta = ADMONITION_META[type.toLowerCase()] ?? {
      icon: "•",
      label: humanize(type),
    };
    const heading = title.trim()
      ? `${meta.label}: ${title.trim()}`
      : meta.label;
    const quoted = body
      .replace(/\s+$/, "")
      .split("\n")
      .map((l) => (l ? `> ${l}` : ">"))
      .join("\n");
    return `> **${meta.icon} ${heading}**\n>\n${quoted}\n`;
  });
}

/** Drop MDX `import`/`export` statement lines (outside code). */
export function stripMdxImports(md: string): string {
  return md
    .split("\n")
    .filter((l) => !/^\s*(import|export)\s.+from\s.+;?\s*$/.test(l))
    .filter((l) => !/^\s*import\s+['"][^'"]+['"];?\s*$/.test(l))
    .join("\n");
}

/** Remove JSX component tags (Capitalised), keeping any inner content. */
export function stripJsxTags(md: string): string {
  return md.replace(/<\/?[A-Z][A-Za-z0-9.]*(?:\s[^>]*?)?\/?>/g, "");
}

/** Resolve a relative posix path against a base dir, collapsing `.`/`..`. */
export function resolveRelative(baseDir: string, target: string): string {
  const stack = baseDir ? baseDir.split("/") : [];
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

interface LinkContext {
  dir: string;
  pathToId: Map<string, string>;
  rawBase: string;
  siteBaseUrl: string;
}

/** Split "path#anchor" → [path, "#anchor" | ""]. */
function splitAnchor(target: string): [string, string] {
  const i = target.indexOf("#");
  return i === -1 ? [target, ""] : [target.slice(0, i), target.slice(i)];
}

/** Percent-decode a link path, tolerating malformed escapes. */
function decodePath(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/**
 * Look up the doc id for a relative link target. Keys in pathToId are lowercased
 * so links work whether they use the filename or a slug, in any case, and with
 * percent-encoded spaces (the repo links to "System%20and%20Security").
 */
function resolveDocId(ctx: LinkContext, rawPath: string): string | undefined {
  const resolved = resolveRelative(ctx.dir, decodePath(rawPath)).toLowerCase();
  const noExt = resolved.replace(/\.mdx?$/i, "");
  const candidates = [
    resolved,
    noExt,
    `${noExt.replace(/\/$/, "")}/index`,
    noExt.replace(/\/index$/i, ""),
  ];
  for (const c of candidates) {
    const id = ctx.pathToId.get(c);
    if (id) return id;
  }
  return undefined;
}

/** Rewrite a single markdown link target to a portal-usable href. */
function rewriteLinkTarget(ctx: LinkContext, target: string): string {
  const trimmed = target.trim();
  if (/^(https?:|mailto:|tel:|#|doc:)/i.test(trimmed)) return trimmed;
  const [path, anchor] = splitAnchor(trimmed);
  if (!path) return trimmed;
  const id = resolveDocId(ctx, path);
  if (id) return `doc:${id}`;
  // Unresolved internal link → fall back to the live docs site (encode spaces).
  const slug = resolveRelative(ctx.dir, decodePath(path)).replace(
    /\.mdx?$/i,
    "",
  );
  const encoded = slug.split("/").map(encodeURIComponent).join("/");
  return `${ctx.siteBaseUrl}/${encoded}${anchor}`;
}

/** Rewrite a relative image src to an absolute raw-content URL. */
function rewriteImageSrc(ctx: LinkContext, src: string, root: string): string {
  const trimmed = src.trim();
  if (/^(https?:|data:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${ctx.rawBase}/static${trimmed}`;
  const resolved = resolveRelative(`${root}/${ctx.dir}`, trimmed);
  return `${ctx.rawBase}/${resolved}`;
}

/** Rewrite markdown links + images (outside code) to portal/absolute targets. */
export function rewriteReferences(
  md: string,
  ctx: LinkContext,
  root: string,
): string {
  return mapOutsideCode(md, (text) => {
    // Images first so their `!` prefix isn't eaten by the link pattern.
    let out = text.replace(
      /!\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g,
      (_m, alt: string, src: string, tail: string) =>
        `![${alt}](${rewriteImageSrc(ctx, src, root)}${tail})`,
    );
    out = out.replace(
      /(^|[^!])\[([^\]]+)\]\(([^)\s]+)([^)]*)\)/g,
      (_m, pre: string, label: string, href: string, tail: string) =>
        `${pre}[${label}](${rewriteLinkTarget(ctx, href)}${tail})`,
    );
    return out;
  });
}

/** Drop a leading `# H1` whose text equals the page title (avoids a dup head). */
export function stripRedundantH1(md: string, title: string): string {
  const m = /^\s*#\s+(.+?)\s*(\n|$)/.exec(md);
  if (m && m[1].trim().toLowerCase() === title.trim().toLowerCase()) {
    return md.slice(m[0].length).replace(/^\n+/, "");
  }
  return md;
}

/** Demote body `# H1` headings to `## H2` so the page title is the sole H1. */
export function demoteHeadings(md: string): string {
  return mapOutsideCode(md, (text) => text.replace(/^# (?=\S)/gm, "## "));
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Section ordering                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

const ROOT_SECTION_ID = "overview";

/** Composite order key: `_category_.json.position` down the dir path. */
function sectionOrderKey(dir: string, categories: CategoryMap): number[] {
  if (dir === "") return [-1];
  const key: number[] = [];
  const segs = dir.split("/");
  for (let i = 0; i < segs.length; i++) {
    const sub = segs.slice(0, i + 1).join("/");
    key.push(categories[sub]?.position ?? 999);
  }
  return key;
}

function compareKeys(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Build                                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

interface ShapedDoc extends DocEntry {
  navLabel: string;
  sidebarPosition: number;
  orderKey: number[];
  sectionLabel: string;
}

/** Turn raw docs + category metadata into the full portal docs manifest. */
export function buildManifest(
  rawDocs: RawDoc[],
  categories: CategoryMap,
  opts: BuildOptions,
): DocsManifest {
  const rawBase = `https://raw.githubusercontent.com/${opts.repo}/${opts.ref}`;
  const editBase = `https://github.com/${opts.repo}/blob/${opts.ref}`;

  // First pass: assign stable ids so links between docs can resolve. Keys are
  // lowercased (case-insensitive link matching); both with and without ext.
  const pathToId = new Map<string, string>();
  for (const doc of rawDocs) {
    const id = docIdForPath(doc.relPath);
    const lower = doc.relPath.toLowerCase();
    pathToId.set(lower, id);
    pathToId.set(lower.replace(/\.mdx?$/i, ""), id);
  }

  const shaped: ShapedDoc[] = rawDocs.map((doc) => {
    const dir = dirOf(doc.relPath);
    const { data, body } = parseFrontmatter(doc.content);
    const title =
      (typeof data.title === "string" && data.title) ||
      firstHeading(body) ||
      humanize(doc.relPath.split("/").pop() ?? doc.relPath);
    const navLabel =
      (typeof data.sidebar_label === "string" && data.sidebar_label) || title;
    const description =
      typeof data.description === "string" ? data.description : undefined;

    const ctx: LinkContext = {
      dir,
      pathToId,
      rawBase,
      siteBaseUrl: opts.siteBaseUrl.replace(/\/$/, ""),
    };
    let markdown = body;
    markdown = stripMdxImports(markdown);
    markdown = convertAdmonitions(markdown);
    markdown = stripJsxTags(markdown);
    markdown = rewriteReferences(markdown, ctx, opts.root);
    markdown = stripRedundantH1(markdown, title);
    markdown = demoteHeadings(markdown).trim();

    const sectionId = dir === "" ? ROOT_SECTION_ID : docIdForPath(dir);
    const sectionLabel =
      dir === ""
        ? "Overview"
        : (categories[dir]?.label ?? humanize(dir.split("/").pop() ?? dir));

    return {
      id: docIdForPath(doc.relPath),
      title,
      navLabel,
      description,
      section: sectionId,
      markdown,
      sourcePath: `${opts.root}/${doc.relPath}`,
      editUrl: `${editBase}/${opts.root}/${doc.relPath}`,
      sidebarPosition:
        typeof data.sidebar_position === "number" ? data.sidebar_position : 999,
      orderKey: sectionOrderKey(dir, categories),
      sectionLabel,
    };
  });

  // Group into sections and order everything deterministically.
  const bySection = new Map<string, ShapedDoc[]>();
  for (const doc of shaped) {
    const list = bySection.get(doc.section) ?? [];
    list.push(doc);
    bySection.set(doc.section, list);
  }

  const nav: DocsNavSection[] = [...bySection.entries()]
    .map(([id, docs]) => {
      const first = docs[0];
      const items = [...docs]
        .sort(
          (a, b) =>
            a.sidebarPosition - b.sidebarPosition ||
            a.navLabel.localeCompare(b.navLabel),
        )
        .map<DocsNavItem>((d) => ({ id: d.id, label: d.navLabel }));
      return {
        id,
        label: first.sectionLabel,
        icon: sectionIcon(first.sectionLabel),
        items,
        _key: first.orderKey,
      };
    })
    .sort(
      (a, b) => compareKeys(a._key, b._key) || a.label.localeCompare(b.label),
    )
    .map(({ _key, ...section }) => section);

  const docs: Record<string, DocEntry> = {};
  for (const d of shaped) {
    docs[d.id] = {
      id: d.id,
      title: d.title,
      description: d.description,
      section: d.section,
      markdown: d.markdown,
      sourcePath: d.sourcePath,
      editUrl: d.editUrl,
    };
  }

  return {
    source: { repo: opts.repo, ref: opts.ref, root: opts.root },
    nav,
    docs,
  };
}
