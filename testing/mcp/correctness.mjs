// Runs real operations over MCP, downloads each result and checks it is semantically right.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { EXPECT, buildFixtures } from "./fixtures.mjs";
import {
  allText,
  formFieldNames,
  isEncrypted,
  loadPdf,
  outlineTitles,
  pageSummary,
  pageTexts,
  rawContentStrings,
  squash,
  tokenForms,
  tryOpen,
  unzip,
  xmlText,
} from "./inspect.mjs";
import { firstText, isPdf, loadConfig, reporter } from "./lib.mjs";

const r = reporter("correctness");
const cfg = loadConfig();
const CALL_TIMEOUT_MS = 10 * 60 * 1000;
const PASSWORD = "Corr3ct-Horse-Battery";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const transport = new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.authHeaders } });
const client = new Client({ name: "stirling-mcp-correctness", version: "1.0.0" });
const offered = new Set();
const TOOL_FOR = {};
const uploaded = {};
let fixtures = {};

/** Calls a tool, waiting out the per-user rate limit and polling slow jobs to completion. */
async function call(name, args) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let res = await client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
    const wait = firstText(res).match(/Rate limit reached.*?Wait (\d+) seconds/);
    if (res.isError && wait) {
      await sleep((Number(wait[1]) + 1) * 1000);
      continue;
    }
    for (let polls = 0; res.structuredContent?.kind === "pending" && polls < 40; polls++) {
      await sleep(15000);
      res = await call("stirling_job_status", { jobId: res.structuredContent.jobId });
    }
    return res;
  }
  throw new Error(`${name}: still rate limited after several retries`);
}

/** Runs one operation through its category tool; throws with the server's text on error. */
async function op(operation, input, parameters = {}) {
  const res = await call(TOOL_FOR[operation], { operation, ...input, parameters });
  if (res.isError) throw new Error(`${operation} returned isError: ${firstText(res).slice(0, 300)}`);
  return res;
}

async function download(fileId) {
  const res = await call("stirling_download", { fileId });
  const blob = res.content?.find((c) => c.type === "resource")?.resource?.blob;
  if (res.isError || !blob) throw new Error(`download of ${fileId} failed: ${firstText(res).slice(0, 200)}`);
  return Buffer.from(blob, "base64");
}

/** The result file of an operation, checked to be a file card first. */
async function fileOf(res) {
  const card = res.structuredContent;
  if (card?.kind !== "file" || !card.fileId) throw new Error(`expected a file result, got ${JSON.stringify(card).slice(0, 300)}`);
  return { card, bytes: await download(card.fileId) };
}

async function pdfOf(res) {
  const out = await fileOf(res);
  if (!isPdf(out.bytes)) throw new Error(`result is not a PDF (${out.card.mimeType}, ${out.bytes.length} bytes)`);
  return out;
}

const fid = (name) => ({ fileId: uploaded[name] });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const has = (text, word) => squash(text).includes(squash(word));
const missing = (text, words) => words.filter((w) => !has(text, w));

/** One named check: requires its operations, catches crashes as failures. */
async function check(label, ops, fn) {
  const absent = ops.filter((o) => !offered.has(o));
  if (absent.length) {
    r.skip(label, `${absent.join(", ")} not offered by this server (dependency missing or operation disabled)`);
    return;
  }
  try {
    const verdict = await fn();
    if (verdict?.skip) r.skip(label, verdict.skip);
    else r.check(label, verdict.ok, verdict.why);
  } catch (e) {
    const msg = e?.message ?? String(e);
    r.check(label, false, /fetch failed|ECONNREFUSED|ECONNRESET/.test(msg) ? `server stopped responding (${msg}); did it crash?` : msg);
  }
}

/** Labels found on each page, in page order. */
async function labelsOf(bytes) {
  return (await pageTexts(bytes)).map((t) => EXPECT.pageLabels.find((l) => t.includes(l)) ?? t.slice(0, 20));
}

async function setup() {
  const { tools } = await client.listTools();
  for (const tool of tools) {
    for (const o of tool.inputSchema?.properties?.operation?.enum ?? []) {
      offered.add(o);
      TOOL_FOR[o] = tool.name;
    }
  }
  fixtures = await buildFixtures();
  for (const [name, bytes] of Object.entries(fixtures)) {
    if (!bytes) continue;
    const up = await call("stirling_upload", { file: Buffer.from(bytes).toString("base64"), fileName: name });
    if (up.isError || !up.structuredContent?.fileId) throw new Error(`upload of ${name} failed: ${firstText(up)}`);
    uploaded[name] = up.structuredContent.fileId;
  }
}

async function pageChecks() {
  await check("rotate-pdf: every page gains /Rotate 90, content order kept", ["rotate-pdf"], async () => {
    const { bytes } = await pdfOf(await op("rotate-pdf", fid("pages.pdf"), { angle: 90 }));
    const rot = (await pageSummary(bytes)).map((p) => p.rotate);
    const labels = await labelsOf(bytes);
    return { ok: rot.every((a) => a === 90) && same(labels, EXPECT.pageLabels), why: `rotations=${rot} labels=${labels}` };
  });

  await check("remove-pages 2,4: pages 1,3,5 remain in order", ["remove-pages"], async () => {
    const { bytes } = await pdfOf(await op("remove-pages", fid("pages.pdf"), { pageNumbers: "2,4" }));
    const labels = await labelsOf(bytes);
    const want = [0, 2, 4].map((i) => EXPECT.pageLabels[i]);
    return { ok: same(labels, want), why: `got ${labels}` };
  });

  await check("rearrange-pages CUSTOM 5,3,1,2,4: pages follow the custom order", ["rearrange-pages"], async () => {
    const { bytes } = await pdfOf(await op("rearrange-pages", fid("pages.pdf"), { customMode: "CUSTOM", pageNumbers: "5,3,1,2,4" }));
    const labels = await labelsOf(bytes);
    const want = [4, 2, 0, 1, 3].map((i) => EXPECT.pageLabels[i]);
    return { ok: same(labels, want), why: `got ${labels}` };
  });

  await check("rearrange-pages REVERSE_ORDER: pages reversed", ["rearrange-pages"], async () => {
    const { bytes } = await pdfOf(await op("rearrange-pages", fid("pages.pdf"), { customMode: "REVERSE_ORDER" }));
    const labels = await labelsOf(bytes);
    return { ok: same(labels, [...EXPECT.pageLabels].reverse()), why: `got ${labels}` };
  });

  await check("merge-pdfs: page count is the sum and inputs keep their order", ["merge-pdfs"], async () => {
    const res = await op("merge-pdfs", { fileIds: [uploaded["pages.pdf"], uploaded["mixed-sizes.pdf"]] });
    const { card, bytes } = await pdfOf(res);
    const texts = await pageTexts(bytes);
    const order = texts.map((t) => EXPECT.pageLabels.find((l) => t.includes(l)) ?? (t.includes("SIZE-A4") ? "SIZE-A4" : t.includes("SIZE-LETTER") ? "SIZE-LETTER" : "?"));
    const want = [...EXPECT.pageLabels, "SIZE-A4", "SIZE-LETTER"];
    const cardOk = card.pageCount === undefined || card.pageCount === 7;
    return { ok: texts.length === 7 && same(order, want) && cardOk, why: `pages=${texts.length} card.pageCount=${card.pageCount} order=${order}` };
  });

  await check("split-pages after 2: two parts holding pages 1-2 and 3-5", ["split-pages"], async () => {
    const res = await op("split-pages", fid("pages.pdf"), { pageNumbers: "2" });
    const parts = res.structuredContent?.parts ?? [];
    const contents = [];
    for (const part of parts) contents.push(await labelsOf(await download(part.fileId)));
    contents.sort((a, b) => EXPECT.pageLabels.indexOf(a[0]) - EXPECT.pageLabels.indexOf(b[0]));
    const want = [EXPECT.pageLabels.slice(0, 2), EXPECT.pageLabels.slice(2)];
    return { ok: parts.length === 2 && same(contents, want), why: `parts=${parts.length} contents=${JSON.stringify(contents)}` };
  });

  await check("scale-pages KEEP: each page keeps its own size", ["scale-pages"], async () => {
    const { bytes } = await pdfOf(await op("scale-pages", fid("mixed-sizes.pdf"), { pageSize: "KEEP", scaleFactor: 1 }));
    const sizes = (await pageSummary(bytes)).map((p) => [Math.round(p.width), Math.round(p.height)]);
    const want = [EXPECT.sizes.a4, EXPECT.sizes.letter].map(([w, h]) => [Math.round(w), Math.round(h)]);
    return { ok: same(sizes, want), why: `got ${JSON.stringify(sizes)} want ${JSON.stringify(want)}` };
  });

  await check("split-pdf-by-chapters: one part per top-level bookmark", ["split-pdf-by-chapters"], async () => {
    const res = await op("split-pdf-by-chapters", fid("bookmarks.pdf"), { bookmarkLevel: 0, includeMetadata: false, allowDuplicates: false });
    const parts = res.structuredContent?.parts ?? [];
    const firsts = [];
    for (const part of parts) firsts.push((await pageTexts(await download(part.fileId))).join(" | "));
    firsts.sort();
    const want = [...EXPECT.chapters].sort();
    return { ok: same(firsts, want), why: `parts=${parts.length} contents=${JSON.stringify(firsts)}` };
  });

  await check("rotate-pdf keeps the outline (bookmarks)", ["rotate-pdf"], async () => {
    const { bytes } = await pdfOf(await op("rotate-pdf", fid("bookmarks.pdf"), { angle: 180 }));
    const titles = await outlineTitles(bytes);
    return { ok: same(titles, EXPECT.chapters), why: `outline=${JSON.stringify(titles)}` };
  });
}

async function contentChecks() {
  await check("add-watermark: watermark text is in the page content, original text kept", ["add-watermark"], async () => {
    const mark = "WMCHECK391";
    const { bytes } = await pdfOf(await op("add-watermark", fid("text.pdf"), { watermarkType: "text", watermarkText: mark, fontSize: 30 }));
    const text = await allText(bytes);
    const lost = missing(text, EXPECT.words);
    return { ok: has(text, mark) && !lost.length, why: `watermark ${has(text, mark) ? "found" : "MISSING"}; lost words: ${lost.join(",") || "none"}` };
  });

  await check("add-stamp: stamp text is in the page content", ["add-stamp"], async () => {
    const stamp = "STAMPCHECK512";
    const { bytes } = await pdfOf(await op("add-stamp", fid("text.pdf"), { stampType: "text", stampText: stamp, pageNumbers: "all" }));
    const text = await allText(bytes);
    return { ok: has(text, stamp) && !missing(text, EXPECT.words).length, why: `stamp ${has(text, stamp) ? "found" : "MISSING"}` };
  });

  await check("ocr-pdf: scanned page gains the expected text", ["ocr-pdf"], async () => {
    if (!uploaded["scanned.pdf"]) return { skip: "scanned fixture needs @napi-rs/canvas, which is not installed" };
    const { bytes } = await pdfOf(await op("ocr-pdf", fid("scanned.pdf"), { languages: ["eng"], ocrType: "force-ocr", ocrRenderType: "sandwich" }));
    const text = await allText(bytes);
    const lost = missing(text, EXPECT.ocrWords);
    return { ok: lost.length === 0, why: `missing ${lost.join(",") || "none"}; text="${text.slice(0, 120)}"` };
  });

  await check("compress-pdf: image-heavy file does not grow and stays readable", ["compress-pdf"], async () => {
    const before = fixtures["image-heavy.pdf"].length;
    const { bytes } = await pdfOf(await op("compress-pdf", fid("image-heavy.pdf"), { optimizeLevel: 5 }));
    const pages = (await loadPdf(bytes)).getPageCount();
    return { ok: bytes.length <= before && pages === 1, why: `${before} -> ${bytes.length} bytes (${((100 * bytes.length) / before).toFixed(1)}%), pages=${pages}` };
  });

  await check("flatten forms: fields removed, filled value kept as page text", ["flatten"], async () => {
    const { bytes } = await pdfOf(await op("flatten", fid("form.pdf"), { flattenOnlyForms: true }));
    const fields = await formFieldNames(bytes);
    const text = await allText(bytes);
    return { ok: fields.length === 0 && has(text, EXPECT.form.value), why: `fields=${JSON.stringify(fields)} valueInText=${has(text, EXPECT.form.value)}` };
  });
}

async function conversionChecks() {
  await check("pdf-to-text txt: output holds the document's words", ["pdf-to-text"], async () => {
    const { bytes } = await fileOf(await op("pdf-to-text", fid("text.pdf"), { outputFormat: "txt" }));
    const text = bytes.toString("utf8");
    const lost = missing(text, EXPECT.words);
    return { ok: !isPdf(bytes) && !lost.length, why: `${bytes.length} bytes; missing ${lost.join(",") || "none"}` };
  });

  await check("pdf-to-markdown: output holds the document's words", ["pdf-to-markdown"], async () => {
    const { bytes } = await fileOf(await op("pdf-to-markdown", fid("text.pdf")));
    const text = bytes.toString("utf8");
    const lost = missing(text, EXPECT.words);
    return { ok: !isPdf(bytes) && !lost.length, why: `${bytes.length} bytes; missing ${lost.join(",") || "none"}` };
  });

  await check("pdf-to-xlsx: valid workbook whose sheets hold the table cells", ["pdf-to-xlsx"], async () => {
    const { bytes } = await fileOf(await op("pdf-to-xlsx", fid("table.pdf")));
    const zip = unzip(bytes);
    const text = xmlText(zip, "xl/");
    const cells = EXPECT.table.rows.flatMap((row) => [row[0]]).concat(EXPECT.table.header[0]);
    const lost = missing(text, cells);
    const hasSheet = [...zip.keys()].some((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
    const priceOk = /\b12\.50?\b/.test(text);
    return { ok: zip.has("xl/workbook.xml") && hasSheet && !lost.length && priceOk, why: `parts=${zip.size} sheet=${hasSheet} missing ${lost.join(",") || "none"} price12.5=${priceOk}` };
  });

  await check("pdf-to-word docx: valid document containing the expected words", ["pdf-to-word"], async () => {
    const { bytes } = await fileOf(await op("pdf-to-word", fid("text.pdf"), { outputFormat: "docx" }));
    const zip = unzip(bytes);
    const text = xmlText(zip, "word/document");
    const lost = missing(text, EXPECT.words);
    return { ok: zip.has("word/document.xml") && !lost.length, why: `document.xml=${zip.has("word/document.xml")} missing ${lost.join(",") || "none"}` };
  });
}

async function securityChecks() {
  await check("add-password: output encrypted, refuses no password, opens with it", ["add-password"], async () => {
    const { bytes } = await pdfOf(await op("add-password", fid("text.pdf"), { password: PASSWORD, ownerPassword: `${PASSWORD}-owner`, keyLength: 256 }));
    const encrypted = await isEncrypted(bytes);
    const without = await tryOpen(bytes);
    const withPw = await tryOpen(bytes, PASSWORD);
    const textOk = withPw.opened && has(withPw.pages.join(" "), EXPECT.keep);
    return {
      ok: encrypted && !without.opened && /Password/i.test(without.error ?? "") && textOk,
      why: `encrypted=${encrypted} noPassword=${without.opened ? "OPENED" : without.error} withPassword=${withPw.opened ? "opened" : withPw.error} textOk=${textOk}`,
    };
  });

  await check("get-info-on-pdf: reported page count matches", ["get-info-on-pdf"], async () => {
    const res = await op("get-info-on-pdf", fid("pages.pdf"));
    const report = await reportOf(res);
    const counts = findValues(report, (k, v) => /^(page ?count|total ?pages|number ?of ?pages|pages)$/i.test(k) && typeof v === "number");
    return { ok: counts.length > 0 && counts.every((n) => n === EXPECT.pageLabels.length), why: `page counts found: ${JSON.stringify(counts)}` };
  });

  await check("extract-bookmarks: reports the fixture's bookmark titles", ["extract-bookmarks"], async () => {
    const res = await op("extract-bookmarks", fid("bookmarks.pdf"));
    const report = JSON.stringify(await reportOf(res));
    const lost = EXPECT.chapters.filter((t) => !report.includes(t));
    return { ok: !lost.length, why: `missing ${lost.join(",") || "none"}` };
  });

  await check("validate-compliance: a plain PDF is reported non-compliant", ["validate-compliance"], async () => {
    const res = await op("validate-compliance", fid("text.pdf"));
    const report = await reportOf(res);
    const flags = findValues(report, (k, v) => /^(compliant|isCompliant|valid|isValid|passed)$/i.test(k) && typeof v === "boolean");
    return { ok: flags.length > 0 && flags.every((f) => f === false), why: `flags=${JSON.stringify(flags)} report=${JSON.stringify(report).slice(0, 200)}` };
  });
}

// Last on purpose: a native crash in redaction would otherwise take every later check with it.
async function redactionChecks() {
  const forms = [...tokenForms(EXPECT.secret), ...tokenForms("7Q4X")];
  const before = await rawContentStrings(fixtures["text.pdf"]);
  const control = forms.some((f) => before.some((s) => s.includes(f)));
  const redactCheck = async (parameters) => {
    if (!control) throw new Error("inspection cannot see the secret in the unredacted fixture, so its absence proves nothing");
    const { bytes } = await pdfOf(await op("auto-redact", fid("text.pdf"), parameters));
    const text = await allText(bytes);
    const raws = await rawContentStrings(bytes);
    const inRaw = forms.filter((f) => raws.some((s) => s.includes(f)));
    const extractable = text.includes(EXPECT.secret) || text.includes("7Q4X");
    const kept = has(text, EXPECT.keep);
    let why = `extractable=${extractable} rawForms=${inRaw.join("|") || "none"} keptOtherText=${kept}`;
    if (extractable) why = `ONLY VISUALLY COVERED: token still extractable as text; ${why}`;
    else if (inRaw.length) why = `token gone from extracted text but still in raw content streams; ${why}`;
    return { ok: !extractable && !inRaw.length && kept, why };
  };
  await check("auto-redact literal: secret gone from text and raw streams, other text kept", ["auto-redact"], () =>
    redactCheck({ listOfText: EXPECT.secret, useRegex: false, wholeWordSearch: false, customPadding: 0, convertPDFToImage: false }),
  );
  await check("auto-redact regex: secret gone from text and raw streams, other text kept", ["auto-redact"], () =>
    redactCheck({ listOfText: "SECRET-[A-Z0-9]{4}-TOKEN", useRegex: true, wholeWordSearch: false, customPadding: 0, convertPDFToImage: false }),
  );
}

async function pipelineChecks() {
  await check("run_pipeline rotate then compress: result is rotated, content kept", ["rotate-pdf", "compress-pdf"], async () => {
    const res = await call("stirling_run_pipeline", {
      fileId: uploaded["pages.pdf"],
      steps: [
        { operation: "rotate-pdf", parameters: { angle: 90 } },
        { operation: "compress-pdf", parameters: { optimizeLevel: 2 } },
      ],
    });
    if (res.isError) throw new Error(firstText(res).slice(0, 300));
    const { bytes } = await pdfOf(res);
    const rot = (await pageSummary(bytes)).map((p) => p.rotate);
    const labels = await labelsOf(bytes);
    return { ok: rot.every((a) => a === 90) && same(labels, EXPECT.pageLabels), why: `rotations=${rot} labels=${labels}` };
  });
}

/** A report's parsed JSON: from structuredContent, or from a JSON file result. */
async function reportOf(res) {
  const card = res.structuredContent;
  if (card?.kind === "report" && card.report !== undefined) return card.report;
  if (card?.kind === "file") return JSON.parse((await download(card.fileId)).toString("utf8"));
  throw new Error(`no report in result: ${JSON.stringify(card).slice(0, 200)}`);
}

/** Every value in a JSON tree whose key and value satisfy the predicate. */
function findValues(node, pred, out = []) {
  if (Array.isArray(node)) node.forEach((n) => findValues(n, pred, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (pred(k, v)) out.push(v);
      findValues(v, pred, out);
    }
  }
  return out;
}

try {
  await client.connect(transport);
  await setup();
  await pageChecks();
  await contentChecks();
  await conversionChecks();
  await securityChecks();
  await pipelineChecks();
  await redactionChecks();
  await client.close();
  r.finish();
} catch (e) {
  r.crash(e);
}
