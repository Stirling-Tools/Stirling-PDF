import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getToolOgImage } from "@app/data/ogImage";
// Build tooling (plain ESM, node:fs only) - import the helpers for coverage.
// eslint-disable-next-line no-restricted-imports -- build script lives outside the @app alias root
import {
  buildOgTags,
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
});
