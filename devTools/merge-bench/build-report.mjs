#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [dir, outFile] = process.argv.slice(2);
if (!dir || !outFile) throw new Error("usage: build-report.mjs <results dir> <out.html>");

const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const listing = fs.readdirSync(dir).sort();
const has = (f) => listing.includes(f);
const json = (f) => JSON.parse(read(f));

const TYPE_NAMES = { small: "Small file", text: "Text-heavy, 2,000 pages", text200: "Text-heavy, 200 pages", image: "Image-heavy, 30 pages", bookmarked: "Bookmarked" };
const TYPE_SHORT = { small: "small", text: "text 2,000p", text200: "text 200p", image: "image 30p", bookmarked: "bookmarked" };
const OPS = {
  merge: { title: "Merge", button: "Merge", endpoint: "/api/v1/general/merge-pdfs", jpdfium: "MergeJob → PdfMerge.merge (or mergeFilesToFile with qpdf direct); the pool runs it in worker processes", pdfbox: "PDFMergerUtility.mergeDocuments with the size-based scratch cache", unit: "merge" },
  pagecount: { title: "Page count", button: "Page count", endpoint: "billing/metering interceptors on every tool request", jpdfium: "PdfDocument.open(Path).pageCount()", pdfbox: "Loader.loadPDF + getNumberOfPages", unit: "file" },
  split: { title: "Split into 10 parts", button: "Split", endpoint: "/split-pages (and the range writer of split-by-chapters)", jpdfium: "PdfSplit.extractPageRange + save per part; file-backed is PdfSplit.extractPageRangeToFile, which the app does not use", pdfbox: "reload per part, removePage, FormUtils.pruneOrphanedFormFields, save (the app's path for AcroForm PDFs)", unit: "split" },
  splitsize: { title: "Split by size (¼ of the file)", button: "Split by size", endpoint: "/split-by-size-or-count", jpdfium: "computeSizeRanges: extractPageRange + save a probe every 5 pages plus look-ahead, then one save per range", pdfbox: "none: size probing is JPDFium only, even for form PDFs", unit: "split" },
  redact: { title: "Auto-redact one term per page", button: "Redact", endpoint: "/api/v1/security/auto-redact", jpdfium: "PdfRedactor.redact(Path, RedactOptions) with removeContent, glyph/ligature/bidi/grapheme aware, redactMetadata", pdfbox: "fallback: TextRedactionService.findTextToRedact + ManualRedactionService.redactFoundText (boxes only, the text stays)", unit: "file" },
  text: { title: "Text extraction", button: "Text", endpoint: "under PDF→Markdown and DocParse", jpdfium: "PdfTextExtractor.extractAll (chars, words, lines with geometry)", pdfbox: "PDFTextStripper.getText (plain text only)", unit: "file" },
  markdown: { title: "PDF → Markdown", button: "Markdown", endpoint: "/api/v1/convert/pdf/markdown, /ingest", jpdfium: "PdfMarkdownConverter (basic) and AdvancedPdfMarkdownConverter (proprietary)", pdfbox: "none since the PDFBox/pdftohtml path was removed", unit: "file" },
  render: { title: "Render 20 pages for form detection", button: "Render", endpoint: "/api/v1/form/form-detection/detect", jpdfium: "PdfDocument.open(byte[]), page.renderAt(dpi) to RGBA, dpi from a 1024 px model input", pdfbox: "PDFRenderer.renderImageWithDPI at the same dpi", unit: "file" },
  protect: { title: "Restore PDF protection", button: "Protect", endpoint: "/restore-pdf-protection", jpdfium: "PDFBox reads the source encryption, PdfSecurity.copyEncryption, PDFBox verifies", pdfbox: "PDFBox reads the source encryption, protect + save, verify", unit: "file" },
};
const BUILD_COLORS = {
  "v130": ["#d9782d", "#a8541a", "#f0a868", "#7a3c10"],
  "v130-qpdf": ["#c0392b", "#8e2a20", "#e57368", "#5e1b14"],
  "pr148": ["#2e9e6b", "#1f6e4a", "#6cc49b", "#134530"],
  "pr148-qpdf": ["#0f8f86", "#0a5f59", "#4cc7bd", "#063c38"],
};
const EXTRA = ["#a8327a", "#6b5bd6", "#8a6a3d", "#5d6676"];

const metas = listing.filter((f) => /^meta-.*\.json$/.test(f)).map(json);
const LABEL_ORDER = ["v130", "v130-qpdf", "pr148", "pr148-qpdf"];
const labelRank = (l) => (LABEL_ORDER.indexOf(l) + 1 || 99);
const labels = metas.map((m) => m.label).sort((a, b) => labelRank(a) - labelRank(b) || a.localeCompare(b));
if (!labels.length) throw new Error(`no meta-*.json in ${dir}`);
const metaOf = Object.fromEntries(metas.map((m) => [m.label, m]));
const meta = metaOf[labels[0]];
const plainLabels = labels.filter((l) => !l.endsWith("-qpdf"));

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => {
    const v = l.split(",");
    const r = Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""]));
    r.status = v.slice(cols.length - 1).join(",");
    return r;
  });
}
const NUM = ["files", "concurrent_requests", "median_seconds", "max_seconds", "cpu_seconds_per_merge", "cpu_per_wall", "peak_heap_mb", "peak_rss_mb", "workers_live"];
let rows = labels.flatMap((l) => has(`bench-${l}.csv`) ? parseCsv(read(`bench-${l}.csv`)) : [])
  .map((r) => { for (const k of NUM) r[k] = r[k] === "" ? NaN : +r[k]; r.op ||= "merge"; return r; });
const pdfboxLabel = rows.find((r) => r.engine === "pdfbox")?.label;
rows = rows.filter((r) => r.engine !== "pdfbox" || r.label === pdfboxLabel);

const buildName = (l) => l.replace(/^v130/, "1.3.0").replace(/^pr148/, "PR 148").replace(/-qpdf$/, " qpdf direct");
function engineName(label, engine) {
  if (engine === "pdfbox") return "PDFBox";
  const b = buildName(label);
  if (engine === "jpdfium") return `JPDFium ${b}`;
  if (engine === "jpdfium-file") return `JPDFium ${b}, file-backed`;
  if (engine === "jpdfium-adv") return `JPDFium ${b}, advanced`;
  const n = +engine.replace("pool", "");
  return `JPDFium ${b}, ${n} worker${n === 1 ? "" : "s"}`;
}
const variantIndex = (e) => e === "jpdfium" ? 0 : e === "jpdfium-file" || e === "jpdfium-adv" ? 1 : e === "pool2" ? 2 : 3;
for (const r of rows) r.engine_name = engineName(r.label, r.engine);
const engines = [...new Map(rows.slice().sort((a, b) =>
  (a.engine === "pdfbox" ? -1 : labels.indexOf(a.label)) - (b.engine === "pdfbox" ? -1 : labels.indexOf(b.label)) || variantIndex(a.engine) - variantIndex(b.engine)
).map((r) => [r.engine_name, r])).values()];
const color = {};
let extra = 0;
for (const r of engines) {
  color[r.engine_name] = r.engine === "pdfbox" ? "#2f6fd6" : (BUILD_COLORS[r.label]?.[variantIndex(r.engine)] ?? EXTRA[extra++ % EXTRA.length]);
}
const engineNames = engines.map((r) => r.engine_name);
const ops = Object.keys(OPS).filter((o) => rows.some((r) => r.op === o));
const typeOrder = Object.keys(TYPE_NAMES);
const concs = [...new Set(rows.map((r) => r.concurrent_requests))].sort((a, b) => a - b);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ms = (s) => !isFinite(s) ? "—" : s < 0.01 ? `${(s * 1000).toFixed(1)} ms` : s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`;
const mb = (v, d = 0) => !isFinite(v) ? "—" : `${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })} MB`;
const pct = (v) => `${v.toFixed(1)}%`;
const times = (v) => !isFinite(v) ? "—" : v >= 1 ? `${v.toFixed(v >= 10 ? 0 : 1)}× faster` : `${(1 / v).toFixed(1 / v >= 10 ? 0 : 1)}× slower`;
const fileSize = (bytes) => bytes >= 1 << 20 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
const ok = (r) => r && r.status === "ok" && isFinite(r.median_seconds);

const profileCases = (meta.profile_cases ?? "").split(/\s+/).filter(Boolean).map((c) => { const [op, t, n] = c.split(":"); return { op, t, n }; })
  .filter((c) => listing.some((f) => /^(profile|leaf|malloc)-/.test(f) && f.includes(`-${c.op}-`) && f.endsWith(`-${c.t}-${c.n}.json`)));
const fileTag = (kind, label, op, engine, t, n) => `${kind}-${label}-${op}-${engine}-${t}-${n}.json`;
const load = (kind, label, op, engine, t, n) => has(fileTag(kind, label, op, engine, t, n)) ? json(fileTag(kind, label, op, engine, t, n)) : null;
const pdfboxProfile = (op, t, n) => { for (const l of labels) { const p = load("profile", l, op, "pdfbox", t, n); if (p) return p; } return null; };
const phases = labels.flatMap((l) => has(`phases-${l}.jsonl`) ? read(`phases-${l}.jsonl`).trim().split("\n").filter(Boolean).map((x) => ({ ...JSON.parse(x), label: l })) : []);
const caseTitle = (op, t, n) => `${OPS[op]?.title ?? op} · ${TYPE_SHORT[t] ?? t}${op === "merge" ? ` ×${n}` : ""}`;

function mainType(op) {
  const ts = new Set(rows.filter((r) => r.op === op).map((r) => r.file_type));
  for (const t of ["text200", "text", "image", "small"]) if (ts.has(t)) return t;
  return [...ts][0];
}
function overviewRows() {
  return ops.map((op) => {
    const t = mainType(op);
    const n = op === "merge" ? Math.max(...rows.filter((r) => r.op === op).map((r) => r.files)) : 1;
    const at = (pred) => rows.filter((r) => r.op === op && r.file_type === t && r.files === n && r.concurrent_requests === concs[0] && pred(r));
    const pb = at((r) => r.engine === "pdfbox")[0];
    const perBuild = labels.filter((l) => !l.endsWith("-qpdf") || op === "merge").map((l) => {
      const cands = at((r) => r.label === l && r.engine !== "pdfbox" && !r.engine.startsWith("pool"));
      const failed = cands.find((r) => !ok(r));
      const best = cands.filter(ok).sort((a, b) => a.median_seconds - b.median_seconds)[0];
      return { label: l, best, failed };
    }).filter((x) => x.best || x.failed);
    return { op, t, n, pb, perBuild };
  });
}

function overviewTable() {
  const head = `<tr><th>Operation</th><th>Workload</th><th>PDFBox</th>${plainLabels.map((l) => `<th>JPDFium ${esc(buildName(l))}</th>`).join("")}${labels.some((l) => l.endsWith("-qpdf")) ? "<th>Best qpdf direct</th>" : ""}</tr>`;
  const body = overviewRows().map(({ op, t, n, pb, perBuild }) => {
    const cell = (x) => {
      if (!x) return `<td class="muted">not run</td>`;
      if (!x.best) return `<td><span class="bad">fails</span><br><span class="note">${esc(x.failed.status.replace(/^FAILED\s*/, "").replace(/^[\w.]+Exception: /, "").slice(0, 70))}</span></td>`;
      const vs = ok(pb) ? `<br><span class="${x.best.median_seconds <= pb.median_seconds ? "good" : "bad"}">${times(pb.median_seconds / x.best.median_seconds)}</span>` : "";
      const variant = x.best.engine === "jpdfium" ? "" : `<br><span class="note">${esc(x.best.engine_name.split(", ")[1] ?? "")}</span>`;
      return `<td><b>${ms(x.best.median_seconds)}</b>${vs}${variant}</td>`;
    };
    const plain = plainLabels.map((l) => cell(perBuild.find((x) => x.label === l)));
    const q = perBuild.filter((x) => x.label.endsWith("-qpdf") && x.best).sort((a, b) => a.best.median_seconds - b.best.median_seconds)[0];
    const qcell = labels.some((l) => l.endsWith("-qpdf")) ? (op === "merge" ? (q ? cell(q).replace("</b>", `</b> <span class="note">${esc(buildName(q.label))}</span>`) : `<td class="muted">—</td>`) : `<td class="muted">n/a</td>`) : "";
    const pbCell = ok(pb) ? `<b>${ms(pb.median_seconds)}</b>` : `<span class="muted">${op === "markdown" || op === "splitsize" ? "no PDFBox path" : "—"}</span>`;
    return `<tr><td><b>${OPS[op].title}</b><br><span class="note">${esc(OPS[op].endpoint)}</span></td><td>${TYPE_SHORT[t]}${op === "merge" ? ` ×${n}` : ""}</td><td>${pbCell}</td>${plain.join("")}${qcell}</tr>`;
  }).join("");
  return `<article class="card"><h2>Every JPDFium operation at a glance</h2>
    <p class="note">Median latency, one request at a time, on the main workload for each operation; the multiple compares with PDFBox. Each build's fastest in-process JPDFium path is shown, with the variant named when it is not the one the app uses. The charts and tables below cover every workload and concurrency.</p>
    <div class="tablebox"><table class="overview"><thead>${head}</thead><tbody>${body}</tbody></table></div></article>`;
}

function opNotes() {
  return ops.map((op) => `<div class="card opnote" data-opnote="${op}" hidden><p><b>${OPS[op].title}</b> · <code>${esc(OPS[op].endpoint)}</code></p><p class="note"><b>JPDFium:</b> ${esc(OPS[op].jpdfium)}<br><b>PDFBox:</b> ${esc(OPS[op].pdfbox)}</p></div>`).join("");
}

function bars(items, colorValue, valueOf, labelOf, cls = "") {
  const max = Math.max(...items.map(valueOf), 1e-9);
  return `<div class="profbars ${cls}">${items.map((it) => `<div class="prow" title="${esc(labelOf(it))}"><span class="plabel">${esc(labelOf(it))}</span><span class="pbar"><i style="width:${(100 * valueOf(it) / max).toFixed(1)}%;background:${colorValue}"></i></span><span class="pval">${it.__v}</span></div>`).join("")}</div>`;
}

function profileCard(title, p, colorValue, malloc, unit) {
  if (!p) return "";
  const frames = p.frames.map((f) => ({ ...f, __v: pct(f.pct) }));
  const classes = p.classes.map((f) => ({ ...f, __v: `${mb(f.mb, 1)}/${p.merges}` }));
  const stacks = p.stacks.map((f) => ({ ...f, __v: `${mb(f.mb, 1)}/${p.merges}` }));
  return `<article class="card"><h3>${esc(title)}</h3>
    <p class="note">CPU samples: <b>${p.native_samples}</b> native + <b>${p.java_samples}</b> Java. Java allocation: <b>${mb(p.alloc_mb_per_merge, 2)}/${unit}</b>. Physical footprint peak: <b>${mb(p.peak_rss_mb)}</b>${malloc ? `. Native heap still live after ${malloc.merges} runs: <b>${malloc.live_matched_mb_per_merge.toFixed(4)} MB/${unit}</b>` : ""}.</p>
    <h4>CPU time by frame</h4>${bars(frames, colorValue, (f) => f.samples, (f) => f.name)}
    ${classes.length ? `<h4>Allocated classes (exact TLAB events, per ${p.merges} runs)</h4>${bars(classes, colorValue, (f) => f.mb, (f) => f.name)}` : ""}
    ${stacks.length ? `<h4>Top allocation stacks</h4>${bars(stacks, colorValue, (f) => f.mb, (f) => f.name, "stacks")}` : ""}
  </article>`;
}

const jpdfiumEnginesFor = (op) => [...new Set(rows.filter((r) => r.op === op && r.engine.startsWith("jpdfium")).map((r) => r.engine))];

function profileSections() {
  return profileCases.map(({ op, t, n }) => {
    const unit = OPS[op]?.unit ?? "run";
    const cards = [profileCard("PDFBox", pdfboxProfile(op, t, n), color.PDFBox, null, unit)];
    for (const l of labels) for (const e of jpdfiumEnginesFor(op)) {
      const name = engineName(l, e);
      cards.push(profileCard(name, load("profile", l, op, e, t, n), color[name] ?? EXTRA[0], load("malloc", l, op, e, t, n), unit));
    }
    const body = cards.join("");
    return body ? `<section class="profcase" data-op="${op}"><h3>${caseTitle(op, t, n)}</h3><div class="grid">${body}</div></section>` : "";
  }).join("");
}

function leafSections() {
  return profileCases.map(({ op, t, n }) => {
    const blocks = [];
    for (const l of labels) for (const e of jpdfiumEnginesFor(op)) {
      const leaf = load("leaf", l, op, e, t, n);
      if (!leaf || !leaf.rows.length) continue;
      const name = engineName(l, e);
      blocks.push(`<div><h3>${esc(name)}</h3><p class="note">${leaf.total_samples.toLocaleString("en-US")} samples over ${leaf.merges} runs.</p>${bars(leaf.rows.map((r) => ({ ...r, __v: pct(r.pct) })), color[name] ?? EXTRA[0], (r) => r.samples, (r) => r.name)}</div>`);
    }
    return blocks.length ? `<section class="profcase" data-op="${op}"><h3>${caseTitle(op, t, n)}</h3><div class="grid">${blocks.join("")}</div></section>` : "";
  }).join("");
}

function phaseBar(p) {
  const parts = [["load", p.load, "#2f6fd6"], ["append/import", p.append, "#d9782d"], ["save", p.save, "#2e9e6b"], ["close", p.close, "#9a988f"]];
  const total = parts.reduce((s, x) => s + x[1], 0) || 1;
  const extraNote = p.file_backed != null ? `<div class="note">file-backed total <b>${Math.round(p.file_backed)} ms</b>; open-only estimate <b>${Math.round(p.open_only)} ms</b></div>` : "";
  return `<div class="phasewrap"><div class="phasebar">${parts.map(([k, v, col]) => `<span class="phase" style="width:${(100 * v / total).toFixed(2)}%;background:${col}" title="${k}: ${Math.round(v)} ms"></span>`).join("")}</div><div>${parts.map(([k, v, col]) => `<span class="leg"><i style="background:${col}"></i>${k} ${Math.round(v)} ms</span>`).join(" ")}</div>${extraNote}</div>`;
}

function phaseSection() {
  if (!phases.length) return "";
  const seen = new Set();
  const blocks = phases.filter((p) => {
    const k = p.engine === "pdfbox" ? `pdfbox-${p.type}-${p.files}` : `${p.label}-${p.type}-${p.files}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((p) => `<div><h3>${TYPE_SHORT[p.type]} ×${p.files} · ${p.engine === "pdfbox" ? "PDFBox" : `JPDFium ${esc(buildName(p.label))}`}</h3>${phaseBar(p)}</div>`);
  return `<article class="card" data-op="merge"><h2>Merge phase breakdown</h2>
    <p class="note">Manual phased path, median of ${phases[0].rounds} rounds: load every input, append/import (PDFBox <code>appendDocument</code>, JPDFium <code>PdfMerge.merge</code>), save, close. It isolates the phases but is not the production <code>MergeJob</code> path, so compare shares rather than totals. File-backed total is <code>PdfMerge.mergeFilesToFile</code> (the qpdf direct path); open-only is opening each input for its page count and bookmarks.</p>
    <div class="grid">${blocks.join("")}</div></article>`;
}

function allocationTiles() {
  return profileCases.map(({ op, t, n }) => {
    const unit = OPS[op]?.unit ?? "run";
    const tiles = [];
    const pb = pdfboxProfile(op, t, n);
    if (pb) tiles.push([`PDFBox Java allocation / ${unit}`, mb(pb.alloc_mb_per_merge, 1)], ["PDFBox peak footprint", mb(pb.peak_rss_mb)]);
    for (const l of labels) for (const e of jpdfiumEnginesFor(op)) {
      const p = load("profile", l, op, e, t, n);
      const m = load("malloc", l, op, e, t, n);
      const name = engineName(l, e);
      if (p) tiles.push([`${name} Java allocation / ${unit}`, mb(p.alloc_mb_per_merge, 3)], [`${name} peak footprint`, mb(p.peak_rss_mb)]);
      if (m) tiles.push([`${name} native heap live / ${unit}`, mb(m.live_matched_mb_per_merge, 4)]);
    }
    return tiles.length ? `<section class="profcase" data-op="${op}"><h3>${caseTitle(op, t, n)}</h3><div class="kv">${tiles.map(([k, v]) => `<div><span>${esc(k)}</span><b>${v}</b></div>`).join("")}</div></section>` : "";
  }).join("");
}

function gaps() {
  const items = [];
  for (const { op, t, pb, perBuild } of overviewRows()) {
    for (const x of perBuild) {
      if (!x.best && x.failed) items.push(`<li><b>${OPS[op].title}, ${esc(buildName(x.label))}:</b> fails, <code>${esc(x.failed.status.replace(/^FAILED\s*/, ""))}</code>.</li>`);
      else if (x.best && ok(pb) && x.best.median_seconds > pb.median_seconds * 1.15) items.push(`<li><b>${OPS[op].title}, ${esc(buildName(x.label))}:</b> ${ms(x.best.median_seconds)} against PDFBox ${ms(pb.median_seconds)} on ${TYPE_SHORT[t]} (${times(pb.median_seconds / x.best.median_seconds)}).</li>`);
    }
    if (!ok(pb) && (op === "markdown" || op === "splitsize")) items.push(`<li><b>${OPS[op].title}:</b> no PDFBox path in the app, so nothing to fall back to if JPDFium fails.</li>`);
  }
  for (const l of labels) {
    const bad = rows.filter((r) => r.label === l && r.status !== "ok" && !r.status.startsWith("FAILED"));
    if (bad.length) items.push(`<li><b>${esc(buildName(l))}:</b> ${bad.length} rows report <code>${esc(bad[0].status)}</code>.</li>`);
  }
  for (const { op, t, n } of profileCases) {
    for (const l of labels) for (const e of jpdfiumEnginesFor(op)) {
      const top = load("leaf", l, op, e, t, n)?.rows?.[0];
      if (top && top.pct >= 40) items.push(`<li><b>${caseTitle(op, t, n)}, ${esc(engineName(l, e))}:</b> ${pct(top.pct)} of native self time is <code>${esc(top.name)}</code>.</li>`);
    }
  }
  return items.length ? `<article class="card"><h2>Gaps the data shows</h2><p class="note">Generated from the results: failures, JPDFium paths more than 15% slower than PDFBox, operations with no fallback, and native hot spots above 40% of self time.</p><ul>${items.join("")}</ul></article>` : "";
}

const analysis = () => has("analysis.html") ? `<article class="card analysis"><h2>What to improve, operation by operation</h2>${read("analysis.html")}</article>` : "";

function method() {
  const sizes = Object.entries(meta.files ?? {}).map(([t, b]) => `${TYPE_SHORT[t] ?? t} ${fileSize(b)}`).join(", ");
  const builds = labels.map((l) => `<code>${esc(buildName(l))}</code> (${esc(metaOf[l].jpdfium)}${metaOf[l].qpdf_direct ? ", <code>jpdfium.merge.qpdfDirect=true</code>" : ""}; ops: ${esc(metaOf[l].ops ?? "merge")})`).join(", ");
  const rssHow = /darwin/i.test(meta.os) ? "macOS <code>proc_pid_rusage</code> lifetime-max physical footprint" : "<code>VmHWM</code>";
  return `<p class="method">Method: ${esc(meta.os)} ${esc(meta.arch)}, ${meta.cpus} CPUs, ${esc(meta.java)}, ${esc(meta.pdfbox)}, run ${esc(meta.date)}. Builds: ${builds}. PR 148 is JPDFium <code>feat/native-safe-domain</code> at <code>0ff9c36</code>, built locally against its pinned prebuilt PDFium and Homebrew qpdf, harfbuzz, ICU and freetype; PDFBox rows come from the first build and use the same PDFBox jars as every build. Inputs are synthetic (<code>pdfs/mkpdf.py</code>, <code>pdfs/mktext.py</code>): ${sizes}. Each row is one fresh JVM with <code>-Xmx4g</code>, ${meta.warmup} warm-up rounds, then ${meta.rounds} measured rounds; a round is one run per concurrent request. CPU is process CPU of the JVM plus worker processes over the measured rounds, divided by the runs. Peak heap is the sum of heap pool peaks after a reset before the measured rounds; peak RSS is ${rssHow} of the JVM plus every worker, including warm-up. JFR recordings use <code>settings=profile</code> with 5 ms execution and native sampling plus exact TLAB allocation events, over ${meta.profile_runs} runs after 2 warm-ups. Native leaf profiles are macOS <code>sample</code> at 1 ms; native heap is <code>malloc_history -allBySize</code>. Every operation copies the JPDFium and PDFBox calls of its controller; see <code>devTools/merge-bench/PdfOps.java</code>.</p>`;
}

const chartRows = rows.map((r) => ({ op: r.op, type: r.file_type, files: r.files, conc: r.concurrent_requests, engine: r.engine_name, time: r.median_seconds, max: r.max_seconds, cpu: r.cpu_seconds_per_merge, cpuwall: r.cpu_per_wall, memory: r.peak_heap_mb, rss: r.peak_rss_mb, status: r.status }));
const opTypes = Object.fromEntries(ops.map((op) => [op, typeOrder.filter((t) => rows.some((r) => r.op === op && r.file_type === t))]));
const firstOp = ops[0];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JPDFium vs PDFBox profile</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<style>
:root{--fg:#1f1f1c;--muted:#6b6a64;--panel:#fff;--line:#e4e2da;--bad:#c0392b;--good:#1f7a4d;--bg:#f7f6f2;--grid:#ecebe5;--axis:#9a988f;--radius:10px;--font:system-ui,-apple-system,"Segoe UI",sans-serif;--serif:Georgia,serif}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--fg:#ecebe5;--muted:#a3a198;--panel:#26251f;--line:#3a3933;--bg:#1b1a16;--grid:#34332d;--axis:#6b6a64;--bad:#ef7b6f;--good:#5cc28f}}
:root[data-theme=dark]{--fg:#ecebe5;--muted:#a3a198;--panel:#26251f;--line:#3a3933;--bg:#1b1a16;--grid:#34332d;--axis:#6b6a64;--bad:#ef7b6f;--good:#5cc28f}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font-family:var(--font)}
main{max-width:1200px;margin:0 auto;display:grid;gap:20px}
main>*{min-width:0}
h1{font-family:var(--serif);font-weight:400;font-size:26px;margin:0;text-wrap:balance}
h2{font-size:16px;margin:0 0 4px;font-weight:600}
h3{font-size:14px;margin:8px 0 4px;font-weight:600}
h4{font-size:12px;margin:10px 0 4px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
p{margin:0;line-height:1.55;font-size:14px;max-width:80ch}
li{font-size:14px;line-height:1.55;margin-bottom:6px}
code{font-size:.92em;overflow-wrap:anywhere}
.note{color:var(--muted);font-size:12px}
.muted{color:var(--muted)}
.bad{color:var(--bad);font-weight:600}
.good{color:var(--good);font-weight:600}
.controls{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;position:sticky;top:0;z-index:3;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line)}
.seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.seg button{font:inherit;font-size:12px;color:var(--fg);background:transparent;border:0;padding:4px 8px;cursor:pointer}
.seg button+button{border-left:1px solid var(--line)}
.seg button[aria-pressed=true]{background:var(--panel);font-weight:600}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:20px;min-width:0;display:grid;gap:8px;align-content:start}
.chart{position:relative;min-height:250px}
.chart svg{display:block;overflow:visible}
.tip{position:absolute;pointer-events:none;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 4px 16px rgba(0,0,0,.12);padding:4px 8px;font-size:12px;white-space:nowrap;z-index:2}
.legend{display:flex;flex-wrap:wrap;gap:8px 12px;font-size:12px;padding:0;margin:0;list-style:none}
.legend i,.leg i{width:.75rem;height:.75rem;border-radius:3px;display:inline-block;margin-right:4px;vertical-align:-1px}
.tablebox{max-height:34rem;overflow:auto;border:1px solid var(--line);border-radius:var(--radius)}
table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums;background:var(--panel)}
th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);white-space:nowrap;vertical-align:top}
th{position:sticky;top:0;background:var(--panel);font-weight:600;z-index:1}
.num{text-align:right}
table.overview td{white-space:normal;min-width:6.5rem}
.profbars{display:grid;gap:4px}
.prow{display:grid;grid-template-columns:minmax(10rem,1.4fr) minmax(5rem,1fr) 7rem;gap:8px;align-items:center;font-size:11px}
.plabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg)}
.pbar{height:10px;background:var(--grid);border-radius:3px;overflow:hidden}
.pbar i{display:block;height:100%}
.pval{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
.stacks .plabel{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;direction:rtl;text-align:left}
.phasewrap{display:grid;gap:6px;margin-top:6px}
.phasebar{display:flex;height:18px;border-radius:4px;overflow:hidden;background:var(--grid)}
.phase{display:block;height:100%}
.leg{font-size:11px;color:var(--muted);margin-right:12px}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:8px}
.kv div{border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--panel)}
.kv b{display:block;font-size:18px;font-variant-numeric:tabular-nums}
.kv span{font-size:11px;color:var(--muted)}
.method{font-size:12px;color:var(--muted);max-width:95ch}
.analysis h3{margin-top:12px}
.analysis ul{margin:4px 0 0;padding-left:20px}
[hidden]{display:none!important}
@media (max-width:560px){.prow{grid-template-columns:minmax(0,1fr) 4rem 5.5rem}}
</style></head><body><main>
<header>
  <h1>JPDFium in Stirling-PDF: time, CPU, memory and profile of every operation</h1>
  <p>Every place the app calls JPDFium, measured the way its controller calls it, against the PDFBox path it replaced or falls back to, for JPDFium ${esc(plainLabels.map(buildName).join(" and "))}${labels.some((l) => l.endsWith("-qpdf")) ? ", plus the qpdf direct merge" : ""}. Pick an operation to drive the charts, tables and profiles below.</p>
</header>

${overviewTable()}
${analysis()}
${gaps()}

<div class="controls">
  <div class="seg" role="group" aria-label="Operation">${ops.map((op) => `<button data-op-btn="${op}" aria-pressed="${op === firstOp}">${OPS[op].button}</button>`).join("")}</div>
  <div class="seg" role="group" aria-label="Metric">
    <button data-metric="time" aria-pressed="true">Time</button>
    <button data-metric="cpu" aria-pressed="false">CPU</button>
    <button data-metric="memory" aria-pressed="false">Peak heap</button>
    <button data-metric="rss" aria-pressed="false">Peak RSS</button>
  </div>
  <div class="seg" role="group" aria-label="Concurrency">${concs.map((c) => `<button data-conc="${c}" aria-pressed="${c === concs[0]}">${c} at once</button>`).join("")}</div>
</div>
${opNotes()}
<ul class="legend" id="legend"></ul>
<section class="grid" id="charts" aria-label="Results by file type"></section>

<article class="card"><h2>Cost per run</h2>
  <p class="note">For the selected operation. CPU is process CPU (the JVM plus worker processes) per run; CPU/wall above 1 means several cores were busy. Peak heap is the parent JVM's Java heap; peak RSS adds native memory and every worker process.</p>
  <div class="tablebox"><table id="costtable"></table></div>
</article>

<article class="card"><h2>Where the time goes</h2>
  <p class="note">JFR profile of ${meta.profile_runs} back-to-back in-process runs after two warm-ups. Native samples are threads inside FFM downcalls or JDK natives; FFM and lambda-form plumbing frames are skipped so a downcall shows as its Java caller. Allocations JFR makes itself are left out.</p>
  <div id="profiles">${profileSections()}</div>
</article>
${phaseSection()}
<article class="card"><h2>Allocation pressure</h2>
  <p class="note">Java allocation per run from JFR, peak physical footprint of the profiling JVM, and native heap still live after the malloc pass (<code>malloc_history -allBySize</code>: malloc blocks whose stack passes through the JPDFium libraries; PartitionAlloc virtual reservations are left out because they are not resident).</p>
  <div id="alloc">${allocationTiles()}</div>
</article>
<article class="card"><h2>Native leaf profile</h2>
  <p class="note">macOS <code>sample</code> at 1 ms of back-to-back in-process runs, counting self time of every frame that runs under a JPDFium native library (so <code>read</code>, <code>fsync</code> and <code>malloc</code> called from QPDF or PDFium count). Release natives are stripped, so an unnamed frame is grouped under its nearest named caller.</p>
  <div id="leaf">${leafSections()}</div>
</article>
${method()}
</main>
<script>
const DATA = ${JSON.stringify(chartRows)};
for (const r of DATA) for (const k of ['time', 'max', 'cpu', 'cpuwall', 'memory', 'rss']) if (r[k] == null) r[k] = NaN;
const ENGINES = ${JSON.stringify(engineNames)};
const COLORS = ${JSON.stringify(color)};
const OP_TYPES = ${JSON.stringify(opTypes)};
const TYPE_NAMES = ${JSON.stringify(TYPE_NAMES)};
const state = {op: ${JSON.stringify(firstOp)}, metric: 'time', conc: ${concs[0]}};
const fmtTime = v => !isFinite(v) ? '—' : v === 0 ? '0' : v < 0.01 ? (v * 1000).toFixed(1) + ' ms' : v < 1 ? Math.round(v * 1000) + ' ms' : d3.format('.2f')(v) + ' s';
const fmt = (m, v) => !isFinite(v) ? '—' : (m === 'time' || m === 'cpu') ? fmtTime(v) : d3.format(',')(Math.round(v)) + ' MB';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const rowsFor = () => DATA.filter(r => r.op === state.op);
function present() { const s = new Set(rowsFor().map(r => r.engine)); return ENGINES.filter(e => s.has(e)); }
function legend() {
  const ul = document.getElementById('legend'); ul.replaceChildren();
  for (const e of present()) { const li = el('li'); const i = el('i'); i.style.background = COLORS[e]; li.append(i, e); ul.append(li); }
}
function charts() {
  const box = document.getElementById('charts'); box.replaceChildren();
  const hosts = OP_TYPES[state.op].map(t => {
    const card = el('article', 'card'); card.append(el('h2', null, TYPE_NAMES[t] || t));
    const c = el('div', 'chart'); card.append(c); box.append(card); return [c, t];
  });
  hosts.forEach(([c, t]) => drawChart(c, t));
}
function drawChart(host, type) {
  const m = state.metric;
  const rs = rowsFor().filter(r => r.type === type && r.conc === state.conc);
  const files = [...new Set(rs.map(r => r.files))].sort((a, b) => a - b);
  const engines = present().filter(e => rs.some(r => r.engine === e));
  const W = Math.max(260, host.clientWidth || 320), H = 250;
  const y = d3.scaleLinear([0, (d3.max(rs.filter(r => isFinite(r[m])), r => r[m]) || 1) * 1.06], [H - 26, 8]).nice();
  const ticks = y.ticks(4);
  const svg = d3.select(host).append('svg').attr('width', '100%').attr('viewBox', \`0 0 \${W} \${H}\`);
  const probe = svg.append('g').attr('font-size', 11);
  const widest = d3.max(ticks, t => { const n = probe.append('text').text(fmt(m, t)).node(); const w = n.getComputedTextLength(); n.remove(); return w; }) || 30;
  probe.remove();
  const left = Math.ceil(widest) + 10;
  ticks.forEach(t => {
    svg.append('line').attr('x1', left).attr('x2', W - 4).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--grid)');
    svg.append('text').attr('x', left - 8).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--muted)').text(fmt(m, t));
  });
  svg.append('line').attr('x1', left).attr('x2', W - 4).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--axis)');
  const x0 = d3.scaleBand(files, [left, W - 4]).paddingInner(0.24).paddingOuter(0.06);
  const x1 = d3.scaleBand(engines, [0, x0.bandwidth()]).paddingInner(0.08);
  if (files.length > 1) files.forEach(n => svg.append('text').attr('x', x0(n) + x0.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--muted)').text(n === 1 ? '1 file' : n + ' files'));
  const tip = el('div', 'tip'); tip.hidden = true; host.append(tip);
  const bar = (x, w, top, base) => { const r = Math.max(0, Math.min(4, w / 2, base - top)); return \`M\${x},\${base}V\${top + r}Q\${x},\${top} \${x + r},\${top}H\${x + w - r}Q\${x + w},\${top} \${x + w},\${top + r}V\${base}Z\`; };
  rs.forEach(r => {
    const x = x0(r.files) + x1(r.engine), w = x1.bandwidth();
    if (isFinite(r[m])) svg.append('path').attr('d', bar(x, w, Math.min(y(r[m]), y(0) - 1), y(0))).attr('fill', COLORS[r.engine]);
    else svg.append('text').attr('x', x + w / 2).attr('y', y(0) - 6).attr('text-anchor', 'middle').attr('font-size', 14).attr('font-weight', 700).attr('fill', 'var(--bad)').text('✕');
    svg.append('rect').attr('x', x - 1).attr('y', 8).attr('width', w + 2).attr('height', y(0) - 8).attr('fill', 'transparent')
      .on('pointermove', ev => {
        tip.replaceChildren();
        const line = el('div'); const sw = el('i'); sw.style.cssText = \`display:inline-block;width:8px;height:8px;border-radius:2px;background:\${COLORS[r.engine]};margin-right:6px\`;
        line.append(sw, r.engine + ': ', el('b', null, isFinite(r[m]) ? fmt(m, r[m]) : 'failed'));
        tip.append(el('div', 'note', \`\${r.files} file(s), \${state.conc} at once\`), line,
          el('div', 'note', r.status === 'ok' ? \`\${fmtTime(r.time)} · CPU \${fmtTime(r.cpu)} · heap \${fmt('memory', r.memory)} · RSS \${fmt('rss', r.rss)}\` : r.status.slice(0, 90)));
        tip.hidden = false;
        const box = host.getBoundingClientRect(), px = ev.clientX - box.left, tw = tip.offsetWidth;
        tip.style.left = Math.max(0, Math.min(box.width - tw, px - tw / 2)) + 'px';
        tip.style.top = Math.max(0, ev.clientY - box.top - tip.offsetHeight - 12) + 'px';
      })
      .on('pointerleave', () => { tip.hidden = true; });
  });
}
function table() {
  const t = document.getElementById('costtable'); t.replaceChildren();
  const head = el('thead'); const tr = el('tr');
  for (const [h, num] of [['Workload'], ['Files', 1], ['At once', 1], ['Engine'], ['Median', 1], ['Slowest', 1], ['CPU/run', 1], ['CPU/wall', 1], ['Peak heap', 1], ['Peak RSS', 1], ['Status']]) tr.append(el('th', num ? 'num' : null, h));
  head.append(tr); t.append(head);
  const body = el('tbody');
  const order = present();
  const rs = rowsFor().slice().sort((a, b) => OP_TYPES[state.op].indexOf(a.type) - OP_TYPES[state.op].indexOf(b.type) || a.conc - b.conc || a.files - b.files || order.indexOf(a.engine) - order.indexOf(b.engine));
  for (const r of rs) {
    const row = el('tr');
    const cells = [[TYPE_NAMES[r.type] || r.type], [r.files, 1], [r.conc, 1], [r.engine], [fmtTime(r.time), 1], [fmtTime(r.max), 1], [isFinite(r.cpu) ? r.cpu.toFixed(3) + ' s' : '—', 1], [isFinite(r.cpuwall) ? r.cpuwall.toFixed(2) + '×' : '—', 1], [fmt('memory', r.memory), 1], [fmt('rss', r.rss), 1], [r.status === 'ok' ? '' : r.status.replace(/^FAILED\\s*/, 'failed: ').slice(0, 90)]];
    cells.forEach(([v, num], i) => row.append(el('td', num ? 'num' : (i === 10 && v ? 'bad' : null), String(v))));
    body.append(row);
  }
  t.append(body);
}
function sections() {
  document.querySelectorAll('[data-op]').forEach(s => s.hidden = s.dataset.op !== state.op);
  document.querySelectorAll('[data-opnote]').forEach(s => s.hidden = s.dataset.opnote !== state.op);
  for (const id of ['profiles', 'alloc', 'leaf']) {
    const box = document.getElementById(id);
    const any = [...box.querySelectorAll('.profcase')].some(c => !c.hidden);
    let empty = box.querySelector('.empty');
    if (!empty) { empty = el('p', 'note empty', 'No profile for this operation.'); box.append(empty); }
    empty.hidden = any;
  }
}
function render() { legend(); charts(); table(); sections(); }
document.querySelectorAll('[data-op-btn]').forEach(b => b.addEventListener('click', () => { state.op = b.dataset.opBtn; document.querySelectorAll('[data-op-btn]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); }));
document.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', () => { state.metric = b.dataset.metric; document.querySelectorAll('[data-metric]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); charts(); }));
document.querySelectorAll('[data-conc]').forEach(b => b.addEventListener('click', () => { state.conc = +b.dataset.conc; document.querySelectorAll('[data-conc]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); charts(); }));
render(); addEventListener('resize', charts);
</script></body></html>
`;
fs.writeFileSync(outFile, html);
console.error(`wrote ${outFile}`);
