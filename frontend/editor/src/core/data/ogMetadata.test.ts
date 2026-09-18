import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getToolOgImage } from "@app/data/ogImage";
import { CORE_LINK_TOOL_IDS } from "@app/types/toolId";
// Build tooling (plain ESM, node:fs only) - import the helpers for coverage.
// oxlint-disable-next-line no-restricted-imports -- build script lives outside the @app alias root
import {
  buildBodyContent,
  buildJsonLd,
  buildOgTags,
  buildSitemap,
  injectBody,
  injectOg,
  prerenderOg,
  resolveDeployBases,
} from "../../../scripts/og-prerender.mjs";

const TEMPLATE = `<!doctype html>
<html lang="en-US">
  <head>
    <base href="./" />
    <title>Stirling PDF</title>
    <meta
      name="description"
      content="A free, private PDF editor you can run on any infrastructure."
    />
    <script type="module" src="/assets/index-abc.js"></script>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`;

describe("getToolOgImage (client resolver)", () => {
  it("maps a tool id to its image (camelCase id, kebab filename)", () => {
    expect(getToolOgImage("", "compress")).toBe("/og_images/compress.png");
    expect(getToolOgImage("", "addPassword")).toBe(
      "/og_images/add-password.png",
    );
  });

  it("maps tools whose art uses a legacy v1 filename", () => {
    expect(getToolOgImage("", "merge")).toBe("/og_images/mergePdfs.png");
    expect(getToolOgImage("", "getPdfInfo")).toBe(
      "/og_images/get-all-info-on-pdf.png",
    );
  });

  it("falls back to the default image for an unknown tool id or null", () => {
    expect(getToolOgImage("", "noSuchToolId")).toBe("/og_images/home.png");
    expect(getToolOgImage("", null)).toBe("/og_images/home.png");
  });

  it("prefixes the base url", () => {
    expect(getToolOgImage("https://x.test", "compress")).toBe(
      "https://x.test/og_images/compress.png",
    );
  });
});

describe("injectOg (build-time prerender)", () => {
  const entry = {
    image: "/og_images/compress.png",
    title: "Compress - Stirling PDF",
    description: "Compress PDFs to reduce their file size.",
  };

  it("replaces title + description and injects exactly one of each", () => {
    const out = injectOg(TEMPLATE, entry, {});
    expect(out).toContain("<title>Compress - Stirling PDF</title>");
    expect(out).toContain(
      '<meta name="description" content="Compress PDFs to reduce their file size." />',
    );
    expect(out.match(/<title>/g)?.length).toBe(1);
    expect(out.match(/name="description"/g)?.length).toBe(1);
  });

  it("uses root-relative URLs and omits og:url when no base is given", () => {
    const out = injectOg(TEMPLATE, entry, { ogBase: "", pageUrlPath: null });
    expect(out).toContain(
      '<meta property="og:image" content="/og_images/compress.png" />',
    );
    expect(out).not.toContain("og:url");
    expect(out).not.toContain("og:image:secure_url");
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("uses absolute URLs + og:url + secure_url when a canonical base is given", () => {
    const out = injectOg(TEMPLATE, entry, {
      ogBase: "https://stirlingpdf.com",
      pageUrlPath: "/compress",
    });
    expect(out).toContain(
      '<meta property="og:image" content="https://stirlingpdf.com/og_images/compress.png" />',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://stirlingpdf.com/compress" />',
    );
    expect(out).toContain("og:image:secure_url");
    // asset path stays absolute-from-root so it resolves at the clean URL
    expect(out).toContain('src="/assets/index-abc.js"');
  });

  it("escapes HTML in metadata", () => {
    const tags = buildOgTags(
      { image: "/x.png", title: 'A "B" & <C>', description: "d" },
      {},
    );
    expect(tags).toContain("A &quot;B&quot; &amp; &lt;C&gt;");
  });

  it("hangs asset URLs off the deploy root exactly as given", () => {
    // The caller folds any sub-path into ogBase, because only it knows whether
    // an origin serves the app at the sub-path or at its own root.
    const subpath = buildOgTags(entry, {
      ogBase: "https://stirling.com/app",
      pageUrlPath: "/compress",
    });
    expect(subpath).toContain(
      '<meta property="og:image" content="https://stirling.com/app/og_images/compress.png" />',
    );
    expect(subpath).toContain(
      '<meta name="twitter:image" content="https://stirling.com/app/og_images/compress.png" />',
    );

    const originRoot = buildOgTags(entry, {
      ogBase: "https://abc123.stirling-pdf.pages.dev",
      pageUrlPath: "/compress",
    });
    expect(originRoot).toContain(
      '<meta property="og:image" content="https://abc123.stirling-pdf.pages.dev/og_images/compress.png" />',
    );
  });

  it("uses ogTitle for the social card but title for the <title> tag", () => {
    const out = injectOg(
      TEMPLATE,
      {
        image: "/og_images/saas/app.png",
        title: "Stirling - Edit any PDF. Govern every PDF.",
        ogTitle: "Edit any PDF. Govern every PDF.",
        description: "d",
      },
      {},
    );
    expect(out).toContain(
      "<title>Stirling - Edit any PDF. Govern every PDF.</title>",
    );
    expect(out).toContain(
      '<meta property="og:title" content="Edit any PDF. Govern every PDF." />',
    );
    expect(out).toContain(
      '<meta name="twitter:title" content="Edit any PDF. Govern every PDF." />',
    );
  });
});

describe("injectOg SEO extras (robots, canonical, JSON-LD)", () => {
  const entry = {
    image: "/og_images/compress.png",
    title: "Compress - Stirling PDF",
    description: "Compress PDFs to reduce their file size.",
  };

  it("always emits a robots directive, indexable by default", () => {
    const out = injectOg(TEMPLATE, entry, {});
    expect(out).toContain('<meta name="robots" content="index, follow" />');
  });

  it("emits noindex when the entry is flagged", () => {
    const out = injectOg(TEMPLATE, entry, { noindex: true });
    expect(out).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("omits canonical + JSON-LD when no canonical origin is known", () => {
    const out = injectOg(TEMPLATE, entry, { ogBase: "", pageUrlPath: "/x" });
    expect(out).not.toContain('rel="canonical"');
    expect(out).not.toContain("application/ld+json");
  });

  it("emits an absolute self-canonical and WebApplication JSON-LD with a base", () => {
    const out = injectOg(TEMPLATE, entry, {
      ogBase: "https://stirling.com",
      canonicalBase: "https://stirling.com",
      pageUrlPath: "/compress",
      canonicalPath: "/compress",
    });
    expect(out).toContain(
      '<link rel="canonical" href="https://stirling.com/compress" />',
    );
    expect(out).toContain(
      '<script type="application/ld+json" data-public-page-schema>',
    );
    expect(out).toContain('"@type":"WebApplication"');
    expect(out).toContain('"@type":"BreadcrumbList"');
  });

  it("omits the price-0 Offer when the entry opts out (metered surfaces)", () => {
    const opts = {
      siteRoot: "https://stirling.com/",
      pageUrl: "https://stirling.com/processor",
      isHome: false,
    };
    expect(buildJsonLd(entry, opts)).toContain('"price":"0"');
    expect(buildJsonLd({ ...entry, noOffer: true }, opts)).not.toContain(
      '"offers"',
    );
  });

  it("escapes '<' inside JSON-LD so a value cannot close the script early", () => {
    const out = injectOg(
      TEMPLATE,
      { ...entry, title: "A <script> B - Stirling PDF" },
      {
        ogBase: "https://stirling.com",
        canonicalBase: "https://stirling.com",
        pageUrlPath: "/x",
      },
    );
    const ldStart = out.indexOf("application/ld+json");
    const ld = out.slice(ldStart, out.indexOf("</script>", ldStart));
    // '<' is escaped (breakout-proof); '>' need not be.
    expect(ld).not.toContain("<script");
    expect(ld).toContain("\\u003cscript");
  });

  it("canonical can point somewhere other than the page URL (alias dedupe)", () => {
    const out = injectOg(TEMPLATE, entry, {
      ogBase: "https://stirling.com",
      canonicalBase: "https://stirling.com",
      pageUrlPath: "/compress-pdf",
      canonicalPath: "/compress",
    });
    expect(out).toContain(
      '<link rel="canonical" href="https://stirling.com/compress" />',
    );
  });
});

describe("buildSitemap", () => {
  const manifest = {
    default: {
      image: "/og_images/home.png",
      title: "Stirling PDF",
      description: "d",
    },
    byTool: {
      compress: {
        image: "/og_images/compress.png",
        title: "Compress - Stirling PDF",
        description: "c",
      },
      "/settings/people": {
        image: "/og_images/home.png",
        title: "People Settings - Stirling PDF",
        description: "p",
        noindex: true,
      },
    },
    byPath: {
      "/compress": "compress",
      "/compress-pdf": "compress",
      "/settings/people": "/settings/people",
    },
    canonicalByPath: { "/compress-pdf": "/compress" },
  };

  it("returns null without a canonical origin (sitemaps need absolute URLs)", () => {
    expect(buildSitemap(manifest, { canonicalBase: "" })).toBeNull();
  });

  it("lists indexable routes as absolute URLs and excludes noindex ones", () => {
    const xml = buildSitemap(manifest, {
      canonicalBase: "https://stirling.com",
    });
    expect(xml).toContain("<loc>https://stirling.com/</loc>");
    expect(xml).toContain("<loc>https://stirling.com/compress</loc>");
    expect(xml).not.toContain("/settings/people");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset");
  });

  it("keeps the sub-path the canonical base carries", () => {
    const xml = buildSitemap(manifest, {
      canonicalBase: "https://stirling.com/app",
    });
    expect(xml).toContain("<loc>https://stirling.com/app/</loc>");
    expect(xml).toContain("<loc>https://stirling.com/app/compress</loc>");
  });

  it("omits aliases that canonicalise to another URL (no duplicate content)", () => {
    const xml = buildSitemap(manifest, {
      canonicalBase: "https://stirling.com",
    });
    expect(xml).not.toContain("/compress-pdf");
    expect(xml).toContain("<loc>https://stirling.com/compress</loc>");
  });
});

describe("buildBodyContent + injectBody (crawlable landing content)", () => {
  const entry = {
    image: "/og_images/compress.png",
    title: "PDF to Word Converter - Stirling PDF",
    description: "Convert PDF files into editable Word documents.",
  };
  const navLinks = [
    { path: "/compress", label: "Compress" },
    { path: "/merge", label: "Merge" },
  ];

  it("emits an H1 (keyword, suffix stripped), the description, and relative tool links", () => {
    const body = buildBodyContent(entry, { navLinks });
    expect(body).toContain("<h1>PDF to Word Converter</h1>");
    expect(body).toContain(
      "<p>Convert PDF files into editable Word documents.</p>",
    );
    // links are relative (no leading slash) so they resolve against <base href>
    expect(body).toContain('<a href="compress">Compress</a>');
    expect(body).toContain('<a href="merge">Merge</a>');
    expect(body).not.toContain('href="/compress"');
  });

  it("uses an explicit heading override for the H1 when given", () => {
    const body = buildBodyContent(entry, {
      navLinks,
      heading: "Free Online PDF Tools",
    });
    expect(body).toContain("<h1>Free Online PDF Tools</h1>");
    expect(body).not.toContain("<h1>PDF to Word Converter</h1>");
  });

  it("escapes HTML in the H1/description", () => {
    const body = buildBodyContent(
      { ...entry, title: "A & <B>", description: 'x "y"' },
      { navLinks: [] },
    );
    expect(body).toContain("<h1>A &amp; &lt;B&gt;</h1>");
    expect(body).toContain("x &quot;y&quot;");
  });

  it("injectBody preserves ordinary HTML outside the empty React mount point", () => {
    const out = injectBody(
      '<body><noscript>Enable JS</noscript><div id="root"></div></body>',
      "<h1>hi</h1>",
    );
    expect(out).toContain(
      '<noscript>Enable JS</noscript><h1>hi</h1><div id="root"></div>',
    );
    // The flash regression: content in #root is painted, then wiped on mount.
    expect(out).toContain('<div id="root"></div>');
  });

  it("prerenderOg injects landing content on indexable pages but not noindex ones", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-body-"));
    await fs.writeFile(path.join(dir, "index.html"), TEMPLATE);
    const manifest = {
      default: {
        image: "/og_images/home.png",
        title: "Stirling PDF",
        description: "home",
      },
      byTool: {
        compress: {
          image: "/og_images/compress.png",
          title: "Compress - Stirling PDF",
          description: "c",
        },
        "/settings/people": {
          image: "/og_images/home.png",
          title: "People Settings - Stirling PDF",
          description: "p",
          noindex: true,
        },
      },
      byPath: {
        "/compress": "compress",
        "/settings/people": "/settings/people",
      },
      navLinks: [{ path: "/compress", label: "Compress" }],
    };

    await prerenderOg({
      distDir: dir,
      manifest,
      ogBase: "",
      baseHref: "/",
      injectLanding: true,
    });

    const compress = await fs.readFile(path.join(dir, "compress.html"), "utf8");
    expect(compress).toContain('<header id="public-page-intro"');
    expect(compress).toContain("<h1>Compress</h1>");
    // Never in #root: React wipes it, so a cold load would flash the link list.
    expect(compress).toContain('<div id="root"></div>');

    const settings = await fs.readFile(
      path.join(dir, "settings", "people.html"),
      "utf8",
    );
    expect(settings).not.toContain("public-page-intro"); // noindex: stock shell
    expect(settings).toContain('<div id="root"></div>');

    const home = await fs.readFile(path.join(dir, "index.html"), "utf8");
    expect(home).toContain("public-page-intro");
    expect(home).toContain('<div id="root"></div>');

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("leaves the mount point empty when landing content is off (self-hosted)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-nobody-"));
    await fs.writeFile(path.join(dir, "index.html"), TEMPLATE);
    const manifest = {
      default: {
        image: "/og_images/home.png",
        title: "Stirling PDF",
        description: "home",
      },
      byTool: {
        compress: {
          image: "/og_images/compress.png",
          title: "Compress - Stirling PDF",
          description: "c",
        },
      },
      byPath: { "/compress": "compress" },
      navLinks: [{ path: "/compress", label: "Compress" }],
    };

    await prerenderOg({ distDir: dir, manifest, ogBase: "", baseHref: "/" });

    const compress = await fs.readFile(path.join(dir, "compress.html"), "utf8");
    expect(compress).toContain('<div id="root"></div>');
    expect(compress).not.toContain("public-page-intro");
    // OG/title metadata is still baked in - only the visible body is skipped.
    expect(compress).toContain("<title>Compress - Stirling PDF</title>");

    const home = await fs.readFile(path.join(dir, "index.html"), "utf8");
    expect(home).not.toContain("public-page-intro");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses to bake landing content from a manifest with no navLinks", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-nonav-"));
    await fs.writeFile(path.join(dir, "index.html"), TEMPLATE);
    const manifest = {
      default: {
        image: "/og_images/home.png",
        title: "Stirling PDF",
        description: "home",
      },
      byTool: {},
      byPath: {},
    };

    await expect(
      prerenderOg({
        distDir: dir,
        manifest,
        ogBase: "https://stirling.com",
        baseHref: "/",
        injectLanding: true,
      }),
    ).rejects.toThrow(/navLinks/);

    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("prerenderOg (flat + nested route files)", () => {
  it("writes a flat file per single-segment route and a nested file (absolute base) per sub-route", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-prerender-"));
    await fs.writeFile(path.join(dir, "index.html"), TEMPLATE);
    const manifest = {
      default: {
        image: "/og_images/home.png",
        title: "Stirling PDF",
        description: "d",
      },
      byTool: {
        compress: {
          image: "/og_images/compress.png",
          title: "Compress - Stirling PDF",
          description: "c",
        },
        "/settings/people": {
          image: "/og_images/home.png",
          title: "People Settings - Stirling PDF",
          description: "p",
        },
      },
      byPath: {
        "/compress": "compress",
        "/settings/people": "/settings/people",
      },
    };

    const count = await prerenderOg({
      distDir: dir,
      manifest,
      ogBase: "",
      baseHref: "/",
    });
    expect(count).toBe(2);

    const flat = await fs.readFile(path.join(dir, "compress.html"), "utf8");
    expect(flat).toContain(
      '<meta property="og:image" content="/og_images/compress.png" />',
    );
    expect(flat).toContain('<base href="./"'); // flat keeps the build's relative base

    const nested = await fs.readFile(
      path.join(dir, "settings", "people.html"),
      "utf8",
    );
    expect(nested).toContain("<title>People Settings - Stirling PDF</title>");
    expect(nested).toContain('<base href="/"'); // nested base rewritten to absolute

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("canonicalises alias routes at their primary URL", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-alias-"));
    await fs.writeFile(path.join(dir, "index.html"), TEMPLATE);
    const manifest = {
      default: {
        image: "/og_images/home.png",
        title: "Stirling PDF",
        description: "d",
      },
      byTool: {
        compress: {
          image: "/og_images/compress.png",
          title: "Compress - Stirling PDF",
          description: "c",
        },
      },
      byPath: { "/compress": "compress", "/compress-pdf": "compress" },
      canonicalByPath: { "/compress-pdf": "/compress" },
    };

    await prerenderOg({
      distDir: dir,
      manifest,
      ogBase: "https://stirling.com",
      canonicalBase: "https://stirling.com",
      baseHref: "/",
    });

    const alias = await fs.readFile(
      path.join(dir, "compress-pdf.html"),
      "utf8",
    );
    expect(alias).toContain(
      '<link rel="canonical" href="https://stirling.com/compress" />',
    );
    // og:url still names the page itself, only the canonical dedupes.
    expect(alias).toContain(
      '<meta property="og:url" content="https://stirling.com/compress-pdf" />',
    );

    const primary = await fs.readFile(path.join(dir, "compress.html"), "utf8");
    expect(primary).toContain(
      '<link rel="canonical" href="https://stirling.com/compress" />',
    );

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("gives the home shell WebSite JSON-LD and flags noindex routes with a base", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-prerender-"));
    await fs.writeFile(path.join(dir, "index.html"), TEMPLATE);
    const manifest = {
      default: {
        image: "/og_images/home.png",
        title: "Stirling PDF",
        description: "home",
      },
      byTool: {
        "/login": {
          image: "/og_images/home.png",
          title: "Sign In - Stirling PDF",
          description: "l",
          noindex: true,
        },
      },
      byPath: { "/login": "/login" },
    };

    await prerenderOg({
      distDir: dir,
      manifest,
      ogBase: "https://stirling.com",
      canonicalBase: "https://stirling.com",
      baseHref: "/",
    });

    const home = await fs.readFile(path.join(dir, "index.html"), "utf8");
    expect(home).toContain('"@type":"WebSite"');
    expect(home).toContain(
      '<link rel="canonical" href="https://stirling.com/"',
    );

    const login = await fs.readFile(path.join(dir, "login.html"), "utf8");
    expect(login).toContain('content="noindex, follow"');

    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("resolveDeployBases (which origin may be published)", () => {
  it("prefixes only the canonical origin with the deploy sub-path", () => {
    expect(
      resolveDeployBases({
        canonicalOrigin: "https://stirling.com/",
        deployOrigin: "https://abc123.stirling-pdf.pages.dev",
        baseHref: "/app/",
      }),
    ).toEqual({
      ogBase: "https://stirling.com/app",
      canonicalBase: "https://stirling.com/app",
    });
  });

  it("serves a per-deployment origin from its own root and never canonicalises there", () => {
    expect(
      resolveDeployBases({
        deployOrigin: "https://abc123.stirling-pdf.pages.dev/",
        baseHref: "/app/",
      }),
    ).toEqual({
      ogBase: "https://abc123.stirling-pdf.pages.dev",
      canonicalBase: "",
    });
  });

  it("has no absolute base at all when neither origin is set (self-hosted)", () => {
    expect(resolveDeployBases({ baseHref: "/" })).toEqual({
      ogBase: "",
      canonicalBase: "",
    });
  });
});

describe("prerenderOg on a sub-path deploy", () => {
  const manifest = {
    default: {
      image: "/og_images/home.png",
      title: "Stirling PDF",
      description: "home",
    },
    byTool: {
      compress: {
        image: "/og_images/compress.png",
        title: "Compress - Stirling PDF",
        description: "c",
      },
    },
    byPath: { "/compress": "compress" },
    navLinks: [{ path: "/compress", label: "Compress" }],
  };

  const run = async (
    env: Parameters<typeof resolveDeployBases>[0],
    prefix: string,
  ) => {
    const bases = resolveDeployBases(env);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    await fs.writeFile(path.join(dir, "index.html"), TEMPLATE);
    await prerenderOg({
      distDir: dir,
      manifest,
      ogBase: bases.ogBase,
      canonicalBase: bases.canonicalBase,
      baseHref: env.baseHref,
      injectLanding: true,
    });
    const html = await fs.readFile(path.join(dir, "compress.html"), "utf8");
    await fs.rm(dir, { recursive: true, force: true });
    return { html, bases };
  };

  it("keeps assets at the deployment's own root and publishes no indexing signal", async () => {
    const { html, bases } = await run(
      {
        deployOrigin: "https://abc123.stirling-pdf.pages.dev",
        baseHref: "/app/",
      },
      "og-preview-",
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://abc123.stirling-pdf.pages.dev/og_images/compress.png" />',
    );
    expect(html).not.toContain("/app/og_images");
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain("application/ld+json");
    expect(buildSitemap(manifest, bases)).toBeNull();
  });

  it("weaves the sub-path in once the public origin is configured", async () => {
    const { html, bases } = await run(
      {
        canonicalOrigin: "https://stirling.com",
        deployOrigin: "https://abc123.stirling-pdf.pages.dev",
        baseHref: "/app/",
      },
      "og-canonical-",
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://stirling.com/app/og_images/compress.png" />',
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://stirling.com/app/compress" />',
    );
    expect(html).toContain('"logo":"https://stirling.com/app/modern-logo');
    expect(html).not.toContain("stirling-pdf.pages.dev");
    expect(buildSitemap(manifest, bases)).toContain(
      "<loc>https://stirling.com/app/compress</loc>",
    );
  });
});

describe("prerender refuses a drifted HTML shell", () => {
  const entry = {
    image: "/og_images/compress.png",
    title: "Compress - Stirling PDF",
    description: "c",
  };

  it("throws instead of silently shipping the shell's own metadata", () => {
    expect(() =>
      injectOg("<html><head><title>x</title></head></html>", entry, {}),
    ).toThrow(/description/);
    expect(() =>
      injectOg(
        '<html><head><meta name="description" content="x" /></head></html>',
        entry,
        {},
      ),
    ).toThrow(/title/);
  });

  it("throws when the React mount point is gone", () => {
    expect(() =>
      injectBody("<body><noscript>Enable JS</noscript></body>", "<h1>x</h1>"),
    ).toThrow(/root/);
  });

  it("prerenders the shipped editor/index.html, not just the test fixture", async () => {
    const here = import.meta.url;
    const shell = await fs.readFile(
      fileURLToPath(new URL("../../../index.html", here)),
      "utf8",
    );
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-real-shell-"));
    await fs.writeFile(path.join(dir, "index.html"), shell);
    const manifest = {
      default: {
        image: "/og_images/home.png",
        title: "Stirling PDF",
        description: "home",
      },
      byTool: {
        compress: {
          image: "/og_images/compress.png",
          title: "Compress - Stirling PDF",
          description: "c",
        },
      },
      byPath: { "/compress": "compress" },
      navLinks: [{ path: "/compress", label: "Compress" }],
    };

    await prerenderOg({
      distDir: dir,
      manifest,
      ogBase: "https://stirling.com",
      canonicalBase: "https://stirling.com",
      baseHref: "/",
      injectLanding: true,
    });

    const html = await fs.readFile(path.join(dir, "compress.html"), "utf8");
    expect(html).toContain("<title>Compress - Stirling PDF</title>");
    expect(html).toContain('<meta name="description" content="c" />');
    expect(html).toContain(
      '<link rel="canonical" href="https://stirling.com/compress" />',
    );
    expect(html).toContain('<header id="public-page-intro"');
    expect(html).toContain('<div id="root"></div>');

    await fs.rm(dir, { recursive: true, force: true });
  });
});

// Contract over the committed generator output, which the fixture-based suites
// above cannot see. Regenerate with `node scripts/generate-og-metadata.mjs`.
describe("shipped OG manifests", () => {
  // Read import.meta.url via a variable: inlined, vite rewrites the
  // `new URL(..., import.meta.url)` asset pattern and the path resolves wrong.
  const here = import.meta.url;
  const load = async (name: string) =>
    JSON.parse(
      await fs.readFile(
        fileURLToPath(new URL(`../../../public/${name}`, here)),
        "utf8",
      ),
    );

  it("emits ordinary public HTML for every indexable SaaS route and explicit private/404 shells", async () => {
    const manifest = await load("og-metadata.saas.json");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-public-contract-"));
    try {
      await fs.writeFile(
        path.join(dir, "index.html"),
        TEMPLATE.replace('type="module"', "type=module"),
      );
      await prerenderOg({
        distDir: dir,
        manifest,
        ogBase: "https://stirling.com/app",
        canonicalBase: "https://stirling.com/app",
        baseHref: "/app/",
        injectLanding: true,
        staticHosting: true,
      });
      for (const [route, id] of Object.entries(manifest.byPath)) {
        const html = await fs.readFile(
          path.join(dir, route.slice(1) + ".html"),
          "utf8",
        );
        const doc = new DOMParser().parseFromString(html, "text/html");
        const entry = manifest.byTool[id as string];
        expect(doc.getElementById("root")?.childElementCount, route).toBe(0);
        if (entry.noindex) {
          expect(doc.getElementById("public-page-intro"), route).toBeNull();
        } else {
          expect(
            doc.querySelector("#public-page-intro h1")?.textContent,
            route,
          ).toBeTruthy();
          expect(
            doc.querySelector("h1")?.closest("#root, noscript"),
            route,
          ).toBeNull();
          expect(
            doc.querySelectorAll("#public-page-details a[href]").length,
            route,
          ).toBeGreaterThan(50);
        }
      }
      const notFound = await fs.readFile(path.join(dir, "404.html"), "utf8");
      expect(notFound).toContain("noindex, follow");
      expect(
        new DOMParser()
          .parseFromString(notFound, "text/html")
          .querySelector('script[type="module"]'),
      ).toBeNull();
      expect(notFound).not.toContain('rel="canonical"');
      const shell = await fs.readFile(path.join(dir, "app-shell.html"), "utf8");
      expect(shell).toContain('<base href="/app/"');
      expect(shell).toContain("noindex, follow");
      expect(shell).not.toContain("public-page-intro");
      const redirects = await fs.readFile(path.join(dir, "_redirects"), "utf8");
      expect(redirects).toContain("/share/* /app-shell.html 200");
      expect(redirects).not.toMatch(/^\/\* /m);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("keeps a preview noindex in its initial HTML and response-header rules", async () => {
    const manifest = await load("og-metadata.saas.json");
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "og-preview-contract-"),
    );
    try {
      await fs.writeFile(path.join(dir, "index.html"), TEMPLATE);
      await prerenderOg({
        distDir: dir,
        manifest,
        ogBase: "https://stirling.com/app",
        canonicalBase: "https://stirling.com/app",
        injectLanding: true,
        staticHosting: true,
        noindex: true,
      });
      expect(
        await fs.readFile(path.join(dir, "compress.html"), "utf8"),
      ).toContain('name="robots" content="noindex, follow"');
      expect(await fs.readFile(path.join(dir, "_headers"), "utf8")).toContain(
        "X-Robots-Tag: noindex, follow",
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it.each(["og-metadata.json", "og-metadata.saas.json"])(
    "%s marks every link tool noindex and keeps it out of the sitemap",
    async (name) => {
      const manifest = await load(name);
      const linkIds: readonly string[] = CORE_LINK_TOOL_IDS;
      for (const id of linkIds)
        expect(manifest.byTool[id]?.noindex, id).toBe(true);

      const linkPaths = Object.entries(manifest.byPath)
        .filter(([, id]) => linkIds.includes(id as string))
        .map(([routePath]) => routePath);
      expect(linkPaths.length).toBeGreaterThanOrEqual(linkIds.length);

      const xml = buildSitemap(manifest, {
        canonicalBase: "https://stirling.com",
      });
      for (const routePath of linkPaths)
        expect(xml).not.toContain(
          `<loc>https://stirling.com${routePath}</loc>`,
        );
    },
  );

  it.each(["og-metadata.json", "og-metadata.saas.json"])(
    "%s canonicalises every alias at a primary that is itself in the sitemap",
    async (name) => {
      const manifest = await load(name);
      const canonicalByPath: Record<string, string> =
        manifest.canonicalByPath ?? {};
      const xml = buildSitemap(manifest, {
        canonicalBase: "https://stirling.com",
      });
      for (const [alias, primary] of Object.entries(canonicalByPath)) {
        expect(alias, `${alias} canonicalises to itself`).not.toBe(primary);
        // A chain (alias -> alias -> primary) drops the target from the sitemap
        // as well, leaving the whole group unindexed.
        expect(canonicalByPath[primary], `${alias} -> ${primary}`).toBe(
          undefined,
        );
        expect(
          manifest.byPath[primary],
          `${alias} -> ${primary}`,
        ).toBeDefined();
        const entry = manifest.byTool[manifest.byPath[primary]];
        if (!entry?.noindex)
          expect(xml, `${alias} -> ${primary}`).toContain(
            `<loc>https://stirling.com${primary}</loc>`,
          );
      }
    },
  );

  it("opts the metered /processor out of the price-0 Offer, not /editor", async () => {
    const manifest = await load("og-metadata.saas.json");
    expect(manifest.byTool["/processor"].noOffer).toBe(true);
    expect(manifest.byTool["/processor"].noindex).toBe(true);
    expect(manifest.byTool["/editor"].noOffer).toBeUndefined();
  });

  it("gives the self-hosted home the brand card, verbatim", async () => {
    const manifest = await load("og-metadata.json");
    expect(manifest.default.title).toBe("Stirling PDF - 30M+ Downloads");
    expect(manifest.default.description).toBe(
      "A free, private PDF editor you can run on any infrastructure.",
    );
    const html = injectOg(TEMPLATE, manifest.default, { isHome: true });
    expect(html).toContain(
      '<meta name="twitter:title" content="Stirling PDF - 30M+ Downloads" />',
    );
    expect(html).toContain(
      '<meta name="twitter:description" content="A free, private ' +
        'PDF editor you can run on any infrastructure." />',
    );
  });

  it.each(["og-metadata.json", "og-metadata.saas.json"])(
    "%s labels every app surface the router actually renders",
    async (name) => {
      const manifest = await load(name);
      // Routes that render a page of their own. Redirect-only paths
      // (/processor/users and friends) are deliberately absent.
      const surfaces = [
        "/editor",
        "/files",
        "/login",
        "/docs",
        "/settings",
        "/settings/api-keys",
        "/processor",
        "/processor/pipelines",
        "/processor/sources",
        "/processor/integrations",
        "/processor/documents",
        "/processor/review",
      ];
      for (const routePath of surfaces) {
        const entry = manifest.byTool[manifest.byPath[routePath]];
        expect(entry, routePath).toBeDefined();
        expect(entry.title, routePath).not.toBe(manifest.default.title);
      }
      // Redirects have nothing to label, so they get no prerendered page.
      for (const gone of ["/processor/users", "/processor/usage"])
        expect(manifest.byPath[gone], gone).toBeUndefined();
    },
  );

  it("keeps prerendered pages off the backend's own static HTML", async () => {
    // ReactRoutingController serves mobile-sign.html itself in desktop mode; a
    // prerendered route of the same name would shadow it.
    const manifest = await load("og-metadata.json");
    for (const reserved of ["/mobile-sign", "/mobile-upload", "/api-landing"])
      expect(manifest.byPath[reserved], reserved).toBeUndefined();
  });

  it.each(["og-metadata.json", "og-metadata.saas.json"])(
    "%s keeps every route within the two segments the backend can serve",
    async (manifestName) => {
      const manifest = await load(manifestName);
      for (const routePath of Object.keys(manifest.byPath))
        expect(
          routePath.replace(/^\//, "").split("/").length,
          routePath,
        ).toBeLessThanOrEqual(2);
    },
  );
});
