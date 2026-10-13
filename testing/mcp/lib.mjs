// Shared config, reporting and checks for the MCP conformance scripts.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PDF = resolve(here, "../../app/common/src/test/resources/example.pdf");
export const MODERN_VERSION = "2026-07-28";

/** Reads --url/--api-key/--bearer/--pdf, falling back to MCP_* env vars. Throws on bad config. */
export function loadConfig(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: "string" },
      "api-key": { type: "string" },
      bearer: { type: "string" },
      pdf: { type: "string" },
    },
    strict: true,
  });
  let url = (values.url ?? process.env.MCP_URL ?? "http://localhost:8080/mcp").replace(/\/+$/, "");
  if (!url.endsWith("/mcp")) url += "/mcp";
  const apiKey = values["api-key"] ?? process.env.MCP_API_KEY;
  const bearer = values.bearer ?? process.env.MCP_BEARER;
  if (!apiKey && !bearer) {
    throw new Error("Set MCP_API_KEY (sent as X-API-KEY) or MCP_BEARER (an OAuth access token).");
  }
  const pdfPath = values.pdf ?? process.env.MCP_SAMPLE_PDF ?? DEFAULT_PDF;
  const pdf = readFileSync(pdfPath);
  return {
    url,
    base: url.slice(0, -"/mcp".length),
    apiKey,
    authHeaders: apiKey ? { "X-API-KEY": apiKey } : { Authorization: `Bearer ${bearer}` },
    pdf,
    pdfBase64: pdf.toString("base64"),
    // any | private | public | off
    expectLinks: (process.env.MCP_EXPECT_LINKS ?? "any").trim().toLowerCase(),
  };
}

/** PASS/FAIL/SKIP printer; finish() prints the tally and exits non-zero on any failure. */
export function reporter(suite) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const check = (label, ok, detail = "") => {
    if (ok) passed++;
    else failed++;
    console.log(`${ok ? "PASS" : "FAIL"} [${suite}] ${label}${detail ? ` - ${detail}` : ""}`);
    return Boolean(ok);
  };
  const skip = (label, why) => {
    skipped++;
    console.log(`SKIP [${suite}] ${label} - ${why}`);
  };
  const finish = () => {
    console.log(`[${suite}] ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}`);
    process.exit(failed ? 1 : 0);
  };
  const crash = (e) => {
    check("unexpected error", false, e?.stack ?? String(e));
    finish();
  };
  return { check, skip, finish, crash };
}

export const isPdf = (bytes) => Buffer.from(bytes).subarray(0, 5).toString("latin1") === "%PDF-";

export const firstText = (result) => result?.content?.find((c) => c.type === "text")?.text ?? "";

/** Checks a result's download link against MCP_EXPECT_LINKS and the share-link access rules. */
export async function checkResultLink(r, cfg, label, card) {
  const link = card?.downloadUrl;
  if (cfg.expectLinks === "off") {
    r.check(`${label}: no download link`, !link, link);
    return;
  }
  if (!link) {
    if (cfg.expectLinks === "any") r.skip(`${label}: download link`, "none returned (links off or sharing not configured)");
    else r.check(`${label}: has a ${cfg.expectLinks} download link`, false, "none returned");
    return;
  }
  const isPrivate = link.includes("/share/");
  if (cfg.expectLinks !== "any") {
    r.check(`${label}: link is ${cfg.expectLinks}`, isPrivate === (cfg.expectLinks === "private"), link);
  }
  const token = link.match(/\/share(?:-links)?\/([^/?#]+)/)?.[1];
  if (!r.check(`${label}: link carries a share token`, token, link)) return;
  const api = `${cfg.base}/api/v1/storage/share-links/${token}`;
  const anon = await fetch(api, { redirect: "manual" });
  if (!isPrivate) {
    const body = Buffer.from(await anon.arrayBuffer());
    r.check(`${label}: public link downloads anonymously`, anon.status === 302 || (anon.status === 200 && isPdf(body)), `HTTP ${anon.status}`);
    return;
  }
  r.check(`${label}: private link opens the /share page`, /\/share\/[^/?#]+\?action=download$/.test(link), link);
  r.check(`${label}: open link targets the /share page`, /\/share\/[^/?#]+\?action=open$/.test(card.openUrl ?? ""), card.openUrl);
  r.check(`${label}: private link refuses anonymous download`, anon.status === 401, `HTTP ${anon.status}`);
  if (!cfg.apiKey) {
    r.skip(`${label}: private link signed-in download`, "needs MCP_API_KEY (an MCP OAuth token is not a Stirling session)");
    return;
  }
  // S3 storage answers with a redirect to a presigned URL the test host may not resolve.
  const signed = await fetch(api, { headers: { "X-API-KEY": cfg.apiKey }, redirect: "manual" });
  const body = Buffer.from(await signed.arrayBuffer());
  r.check(`${label}: private link downloads when signed in`, signed.status === 302 || (signed.status === 200 && isPdf(body)), `HTTP ${signed.status}`);
}
