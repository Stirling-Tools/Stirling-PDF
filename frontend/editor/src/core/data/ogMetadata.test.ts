import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getToolOgImage } from "@app/data/ogImage";
// Build tooling (plain ESM, node:fs only) - import the helpers for coverage.
// eslint-disable-next-line no-restricted-imports -- build script lives outside the @app alias root
import {
  buildBodyContent,
  buildOgTags,
  buildSitemap,
  injectBody,
  injectOg,
  prerenderOg,
} from "../../../scripts/og-prerender.mjs";

const TEMPLATE = `<!doctype html>
<html lang="en-US">
  <head>
    <base href="./" />
    <title>Stirling PDF</title>
    <meta
      name="description"
      content="The Free Adobe Acrobat alternative (10M+ Downloads)"
    />
    <script type="module" src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
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

  it("weaves the sub-path prefix into the absolute image URL", () => {
    const tags = buildOgTags(entry, {
      ogBase: "https://stirling.com",
      pageUrlPath: "/app/compress",
      pathPrefix: "/app",
    });
    // image lives under the sub-path too, like canonical/og:url/logo
    expect(tags).toContain(
      '<meta property="og:image" content="https://stirling.com/app/og_images/compress.png" />',
    );
    expect(tags).toContain(
      '<meta name="twitter:image" content="https://stirling.com/app/og_images/compress.png" />',
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
      pageUrlPath: "/compress",
      canonicalPath: "/compress",
    });
    expect(out).toContain(
      '<link rel="canonical" href="https://stirling.com/compress" />',
    );
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain('"@type":"WebApplication"');
    expect(out).toContain('"@type":"BreadcrumbList"');
  });

  it("escapes '<' inside JSON-LD so a value cannot close the script early", () => {
    const out = injectOg(
      TEMPLATE,
      { ...entry, title: "A <script> B - Stirling PDF" },
      { ogBase: "https://stirling.com", pageUrlPath: "/x" },
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
      "/settings/people": "/settings/people",
    },
  };

  it("returns null without a canonical origin (sitemaps need absolute URLs)", () => {
    expect(buildSitemap(manifest, { ogBase: "" })).toBeNull();
  });

  it("lists indexable routes as absolute URLs and excludes noindex ones", () => {
    const xml = buildSitemap(manifest, { ogBase: "https://stirling.com" });
    expect(xml).toContain("<loc>https://stirling.com/</loc>");
    expect(xml).toContain("<loc>https://stirling.com/compress</loc>");
    expect(xml).not.toContain("/settings/people");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset");
  });

  it("weaves a sub-path prefix into every URL", () => {
    const xml = buildSitemap(manifest, {
      ogBase: "https://stirling.com",
      pathPrefix: "/app",
    });
    expect(xml).toContain("<loc>https://stirling.com/app/</loc>");
    expect(xml).toContain("<loc>https://stirling.com/app/compress</loc>");
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

  it("injectBody fills the empty React mount point", () => {
    const out = injectBody(
      '<body><div id="root"></div><script></script></body>',
      "<h1>hi</h1>",
    );
    expect(out).toContain('<div id="root"><h1>hi</h1></div>');
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

    await prerenderOg({ distDir: dir, manifest, ogBase: "", baseHref: "/" });

    const compress = await fs.readFile(path.join(dir, "compress.html"), "utf8");
    expect(compress).toContain('<div id="root"><div class="spdf-seo">');
    expect(compress).toContain("<h1>Compress</h1>");

    const settings = await fs.readFile(
      path.join(dir, "settings", "people.html"),
      "utf8",
    );
    expect(settings).toContain('<div id="root"></div>'); // noindex: bare shell

    const home = await fs.readFile(path.join(dir, "index.html"), "utf8");
    expect(home).toContain("spdf-seo");

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
