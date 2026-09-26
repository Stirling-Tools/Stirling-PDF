import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const baseArg = process.argv[2];
if (!baseArg)
  throw new Error(
    "Usage: task frontend:seo:verify -- https://stirling.com/app/",
  );
const base = new URL(baseArg.replace(/\/?$/, "/"));
const failures = [];

async function check(label, run) {
  try {
    await run();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures.push(label);
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  return { response, text: await response.text() };
}

for (const route of ["", "compress", "merge", "editor", "compress-pdf"]) {
  await check(`initial HTML: ${route || "/"}`, async () => {
    const { response, text } = await request(new URL(route, base));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex/i);
    const doc = new JSDOM(text).window.document;
    const h1 = doc.querySelector("#public-page-intro h1");
    assert.ok(h1?.textContent?.trim(), "Missing public heading");
    assert.equal(
      h1.closest("noscript, #root"),
      null,
      "Public content must be outside noscript and React's mount point",
    );
    assert.ok(
      doc.querySelectorAll("#public-page-details a[href]").length > 50,
      "Missing tool links",
    );
    const canonicalRoute = route === "compress-pdf" ? "compress" : route;
    assert.equal(
      doc.querySelector('link[rel="canonical"]')?.href,
      new URL(canonicalRoute, base).href,
    );
    assert.equal(
      doc.querySelector('meta[name="robots"]')?.content,
      "index, follow",
    );
    const schema = doc.querySelector('script[type="application/ld+json"]');
    assert.ok(schema, "Missing structured data");
    assert.ok(JSON.parse(schema.textContent)["@graph"].length);
    assert.ok(
      doc.querySelector('link[rel="stylesheet"]'),
      "Public content must be styled before JavaScript loads",
    );
  });
}

await check("private login response", async () => {
  const { response, text } = await request(new URL("login", base));
  assert.equal(response.status, 200);
  const doc = new JSDOM(text).window.document;
  assert.match(
    doc.querySelector('meta[name="robots"]')?.content || "",
    /noindex/,
  );
  assert.equal(doc.querySelector("#public-page-intro"), null);
});

await check("unknown route is a real 404", async () => {
  const { response } = await request(
    new URL("seo-verification-missing-page-8056", base),
  );
  assert.equal(response.status, 404);
});

await check("XML sitemap", async () => {
  const { response, text } = await request(new URL("sitemap.xml", base));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /xml/);
  const doc = new JSDOM(text, { contentType: "text/xml" }).window.document;
  assert.equal(doc.documentElement.localName, "urlset");
  const urls = [...doc.querySelectorAll("loc")].map((node) => node.textContent);
  assert.ok(urls.includes(new URL("compress", base).href));
  assert.ok(
    urls.every((url) => url.startsWith(base.href)),
    "Sitemap has the wrong public origin or prefix",
  );
  assert.ok(!urls.includes(new URL("login", base).href));
  assert.ok(!urls.includes(new URL("compress-pdf", base).href));
});

await check("root robots advertises the app sitemap", async () => {
  const { response, text } = await request(new URL("/robots.txt", base));
  assert.equal(response.status, 200);
  assert.ok(
    text
      .split(/\r?\n/)
      .some(
        (line) =>
          line.trim() === `Sitemap: ${new URL("sitemap.xml", base).href}`,
      ),
  );
});

if (base.hostname === "stirling.com") {
  await check(
    "www app URL permanently redirects to the canonical host",
    async () => {
      const url = new URL("compress", base);
      url.hostname = "www.stirling.com";
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
      assert.ok([301, 308].includes(response.status));
      assert.equal(
        new URL(response.headers.get("location"), url).href,
        new URL("compress", base).href,
      );
    },
  );
}

if (failures.length) process.exitCode = 1;
