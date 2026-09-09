import { describe, expect, it } from "vitest";
import {
  buildManifest,
  convertAdmonitions,
  demoteHeadings,
  docIdForPath,
  humanize,
  parseFrontmatter,
  resolveRelative,
  rewriteReferences,
  sectionIcon,
  stripJsxTags,
  stripMdxImports,
  stripRedundantH1,
  type CategoryMap,
  type RawDoc,
} from "@portal/docs/manifest/transform";

const OPTS = {
  repo: "Owner/Repo",
  ref: "main",
  root: "docs",
  siteBaseUrl: "https://docs.example.com",
};

describe("parseFrontmatter", () => {
  it("splits scalar YAML frontmatter from the body", () => {
    const { data, body } = parseFrontmatter(
      "---\ntitle: OCR\nsidebar_position: 7\n---\n# Heading\ntext",
    );
    expect(data.title).toBe("OCR");
    expect(data.sidebar_position).toBe(7);
    expect(body).toBe("# Heading\ntext");
  });

  it("returns the whole content as body when there is no frontmatter", () => {
    const { data, body } = parseFrontmatter("# Just a doc\nbody");
    expect(data).toEqual({});
    expect(body).toBe("# Just a doc\nbody");
  });

  it("normalises CRLF line endings", () => {
    const { data } = parseFrontmatter("---\r\nid: x\r\n---\r\nbody");
    expect(data.id).toBe("x");
  });
});

describe("id + label helpers", () => {
  it("slugifies nested paths", () => {
    expect(docIdForPath("Configuration/OCR.md")).toBe("configuration/ocr");
    expect(docIdForPath("Getting Started.md")).toBe("getting-started");
  });

  it("humanises file/dir names", () => {
    expect(humanize("Getting-Started.md")).toBe("Getting Started");
  });

  it("picks a section icon from the label", () => {
    expect(sectionIcon("Configuration")).toBe("⚙");
    expect(sectionIcon("Totally Unknown")).toBe("◇");
  });
});

describe("MDX normalisation", () => {
  it("converts admonitions to titled blockquotes", () => {
    const out = convertAdmonitions(":::tip Upgrading?\nread this\n:::");
    expect(out).toContain("> **💡 Tip: Upgrading?**");
    expect(out).toContain("> read this");
  });

  it("strips import/export statements", () => {
    const out = stripMdxImports("import Tabs from '@theme/Tabs';\n# Keep");
    expect(out).toBe("# Keep");
  });

  it("removes JSX component tags but keeps inner content", () => {
    expect(
      stripJsxTags("<Tabs>\n<TabItem value='a'>keep</TabItem>\n</Tabs>"),
    ).toContain("keep");
    expect(stripJsxTags("<TabItem>x</TabItem>")).not.toMatch(/<TabItem/);
  });

  it("demotes body H1 to H2 but leaves code comments alone", () => {
    const md = "# Title\n\n```bash\n# a shell comment\n```";
    const out = demoteHeadings(md);
    expect(out).toContain("## Title");
    expect(out).toContain("# a shell comment");
  });

  it("strips a leading H1 that duplicates the page title", () => {
    expect(stripRedundantH1("# OCR\nbody", "OCR")).toBe("body");
    expect(stripRedundantH1("# Other\nbody", "OCR")).toBe("# Other\nbody");
  });
});

describe("resolveRelative", () => {
  it("collapses ./ and ../ against a base dir", () => {
    expect(resolveRelative("Configuration", "./OCR.md")).toBe(
      "Configuration/OCR.md",
    );
    expect(
      resolveRelative("Configuration", "../Functionality/Compare.md"),
    ).toBe("Functionality/Compare.md");
  });
});

describe("rewriteReferences", () => {
  const ctx = {
    dir: "Configuration",
    // Keys are lowercased file paths (spaces preserved), as buildManifest builds them.
    pathToId: new Map([
      [
        "configuration/system and security",
        "configuration/system-and-security",
      ],
    ]),
    rawBase: "https://raw.example.com/Owner/Repo/main",
    siteBaseUrl: "https://docs.example.com",
  };

  it("rewrites resolvable internal links to the doc: scheme (decoded + case-insensitive)", () => {
    const out = rewriteReferences(
      "see [sec](./System%20and%20Security.md)",
      ctx,
      "docs",
    );
    expect(out).toBe("see [sec](doc:configuration/system-and-security)");
  });

  it("falls back to the live docs site for unresolved internal links", () => {
    const out = rewriteReferences("[x](./Missing.md)", ctx, "docs");
    expect(out).toBe("[x](https://docs.example.com/Configuration/Missing)");
  });

  it("leaves absolute and anchor links untouched", () => {
    const md = "[a](https://x.com) and [b](#top)";
    expect(rewriteReferences(md, ctx, "docs")).toBe(md);
  });

  it("rewrites relative images to absolute raw URLs", () => {
    expect(rewriteReferences("![a](./img/x.png)", ctx, "docs")).toBe(
      "![a](https://raw.example.com/Owner/Repo/main/docs/Configuration/img/x.png)",
    );
    expect(rewriteReferences("![a](/img/y.png)", ctx, "docs")).toBe(
      "![a](https://raw.example.com/Owner/Repo/main/static/img/y.png)",
    );
  });

  it("does not rewrite inside fenced code blocks", () => {
    const md = "```\n[x](./y.md)\n```";
    expect(rewriteReferences(md, ctx, "docs")).toBe(md);
  });
});

describe("buildManifest", () => {
  const rawDocs: RawDoc[] = [
    {
      relPath: "Getting Started.md",
      content: "---\nsidebar_position: 0\n---\nintro",
    },
    {
      relPath: "Configuration/OCR.md",
      content: "---\ntitle: OCR\nsidebar_position: 7\n---\n# OCR\nbody",
    },
    {
      relPath: "Configuration/DATABASE.md",
      content: "---\nsidebar_position: 1\n---\n# Database\nsee [ocr](./OCR.md)",
    },
  ];
  const categories: CategoryMap = {
    Configuration: { label: "Configuration", position: 5 },
  };

  it("auto-sorts sections (root Overview first, then by category position)", () => {
    const m = buildManifest(rawDocs, categories, OPTS);
    expect(m.nav.map((s) => s.id)).toEqual(["overview", "configuration"]);
    expect(m.nav[0].label).toBe("Overview");
    expect(m.nav[1].label).toBe("Configuration");
  });

  it("orders nav items by sidebar_position", () => {
    const m = buildManifest(rawDocs, categories, OPTS);
    const config = m.nav.find((s) => s.id === "configuration")!;
    expect(config.items.map((i) => i.id)).toEqual([
      "configuration/database",
      "configuration/ocr",
    ]);
  });

  it("derives titles from frontmatter, heading, then filename", () => {
    const m = buildManifest(rawDocs, categories, OPTS);
    expect(m.docs["configuration/ocr"].title).toBe("OCR");
    expect(m.docs["getting-started"].title).toBe("Getting Started");
  });

  it("resolves cross-doc links and records source/edit urls", () => {
    const m = buildManifest(rawDocs, categories, OPTS);
    expect(m.docs["configuration/database"].markdown).toContain(
      "[ocr](doc:configuration/ocr)",
    );
    expect(m.docs["configuration/ocr"].sourcePath).toBe(
      "docs/Configuration/OCR.md",
    );
    expect(m.docs["configuration/ocr"].editUrl).toBe(
      "https://github.com/Owner/Repo/blob/main/docs/Configuration/OCR.md",
    );
  });
});
