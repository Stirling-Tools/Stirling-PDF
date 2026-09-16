// Lighthouse runner - audits the routes in routes.mjs against a production
// build and writes one normalised summary for the gate (check.mjs) to diff.
//
//   node lighthouse/run.mjs                      # build must already exist
//   node lighthouse/run.mjs --runs 5             # more runs, tighter medians
//   node lighthouse/run.mjs --url http://host    # audit a server you started
//   node lighthouse/run.mjs --only mobile-scanner
//
// Exit codes: 0 ok · 2 unusable run (build missing, route errored, no Chrome).
//
// Serves `editor/dist` with `vite preview`, so the byte counts are the real
// built bundle as a browser pulls it - lazy chunks, fonts and the pdfium wasm
// included - not a bundler's idea of chunk sizes. No backend runs: /api calls
// fail the same way on every run, which keeps the numbers comparable, and the
// bytes we gate on are the frontend's own regardless.
//
// Each metric is the median across --runs, taken per metric rather than by
// picking one "median run": byte counts are identical run to run, so only the
// timings actually move, and a per-metric median stops one slow run dragging
// unrelated numbers with it. A discarded warm-up pass runs first so the
// browser session's first-navigation cost lands outside the measured runs.

import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// oxlint-disable-next-line no-restricted-imports -- plain node script, run outside the bundler where @app/* does not resolve
import { ROUTES, ROUTE_IDS } from "./routes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(here, "..");
const editorDir = join(frontendDir, "editor");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  const v = i >= 0 ? args[i + 1] : undefined;
  // A flag given without a value is a mistake, not a request for the default.
  if (i >= 0 && (v === undefined || v.startsWith("--"))) {
    die(`${name} requires a value`);
  }
  return v ?? fallback;
};

const runs = Number(opt("--runs", "3"));
const outDir = resolve(frontendDir, opt("--out", ".lighthouse-reports"));
const externalUrl = opt("--url", "");
// Not 5173 or 5273: those are the Playwright suite's dev and desktop
// servers, and strictPort would fail if one is already up.
const port = Number(opt("--port", process.env.LIGHTHOUSE_PORT ?? "5373"));
const only = opt("--only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function die(message) {
  console.error(`lighthouse: ${message}`);
  process.exit(2);
}

if (!Number.isInteger(runs) || runs < 1)
  die("--runs must be a positive integer");
for (const id of only) {
  if (!ROUTE_IDS.includes(id))
    die(`unknown route id "${id}" (have: ${ROUTE_IDS.join(", ")})`);
}
const routes = only.length ? ROUTES.filter((r) => only.includes(r.id)) : ROUTES;

// Puppeteer's pinned Chrome rather than whatever Chrome the machine has.
// Lighthouse numbers shift between Chrome versions, so a floating system
// browser would move the baseline under us on an unrelated runner-image bump.
// LIGHTHOUSE_CHROME_PATH exists for anyone who must override that.
async function chromeExecutable() {
  const override = process.env.LIGHTHOUSE_CHROME_PATH;
  if (override) {
    if (!existsSync(override))
      die(`LIGHTHOUSE_CHROME_PATH does not exist: ${override}`);
    return override;
  }
  const { default: puppeteer } = await import("puppeteer");
  const path = puppeteer.executablePath();
  if (!existsSync(path)) {
    die(
      `Chrome not found at ${path}\n` +
        `  Install it with:  npx puppeteer browsers install chrome\n` +
        `  Or point LIGHTHOUSE_CHROME_PATH at a Chrome binary.`,
    );
  }
  return path;
}

/** Serves editor/dist with Vite's preview server and resolves once it answers. */
async function startPreview() {
  if (!existsSync(join(editorDir, "dist", "index.html"))) {
    die("editor/dist/index.html is missing - run `task frontend:build` first");
  }
  // Vite's programmatic preview rather than a spawned `npx vite preview`: no
  // shell wrapper to leak on Windows, and server.close() actually stops it.
  // The flag must match the one the bundle was built with or the config picks
  // the relative base, under which deep routes 404 their own assets.
  process.env.VITE_BUILD_FOR_PREVIEW = "1";
  const { preview } = await import("vite");
  const server = await preview({
    root: editorDir,
    preview: { port, strictPort: true },
    logLevel: "warn",
  });

  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { url, stop: () => server.httpServer.close() };
    } catch {
      // Not listening yet - keep polling until the deadline.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  server.httpServer.close();
  die(`vite preview did not answer on ${url} within 60s`);
}

const num = (audit) =>
  typeof audit?.numericValue === "number" ? audit.numericValue : null;

/**
 * Collapses one Lighthouse result to the numbers the gate and the report need.
 *
 * Byte totals are summed from the network-requests audit rather than read off
 * `total-byte-weight`, so the total and the per-type breakdown can never
 * disagree - that audit reports only the heaviest requests.
 */
function extract(lhr) {
  const items = lhr.audits["network-requests"]?.details?.items ?? [];
  const byType = {};
  let totalBytes = 0;
  let requests = 0;

  for (const item of items) {
    // Requests the page started but never finished (a cancelled prefetch, an
    // /api call still in flight at teardown) transfer an arbitrary slice of
    // their body, which is exactly the kind of run-to-run wobble the gate
    // must not see.
    if (item.finished === false) continue;
    const type = item.resourceType ?? "Other";
    const bytes = item.transferSize ?? 0;
    byType[type] ??= { bytes: 0, requests: 0 };
    byType[type].bytes += bytes;
    byType[type].requests += 1;
    totalBytes += bytes;
    requests += 1;
  }

  return {
    budget: {
      totalBytes,
      scriptBytes: byType.Script?.bytes ?? 0,
      requests,
      scriptRequests: byType.Script?.requests ?? 0,
    },
    byType,
    // Every category Lighthouse scored, not a hardcoded four: 13 added
    // `agentic-browsing`, and a fixed list silently drops whatever comes next.
    scores: Object.fromEntries(
      Object.keys(lhr.categories)
        .sort()
        .map((id) => [id, lhr.categories[id].score ?? null]),
    ),
    timings: {
      fcp: num(lhr.audits["first-contentful-paint"]),
      lcp: num(lhr.audits["largest-contentful-paint"]),
      tbt: num(lhr.audits["total-blocking-time"]),
      cls: num(lhr.audits["cumulative-layout-shift"]),
      speedIndex: num(lhr.audits["speed-index"]),
      bootupTime: num(lhr.audits["bootup-time"]),
      // Lighthouse 13 renamed dom-size to dom-size-insight. Accept either so a
      // major bump reports a blank rather than silently dropping the metric.
      domSize: num(lhr.audits["dom-size-insight"] ?? lhr.audits["dom-size"]),
    },
  };
}

/**
 * Median of `values`, averaging the middle pair on an even count.
 *
 * Deliberately not rounded: category scores are 0-1 and CLS is typically under
 * 0.1, so rounding an even-count median would collapse both to 0. Callers round
 * the counts that are integers by nature.
 */
function median(values) {
  const nums = values
    .filter((v) => typeof v === "number")
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/** Per-metric median over the per-run extracts, preserving the object shape. */
function medianExtracts(extracts) {
  const pick = (group, key) => median(extracts.map((e) => e[group][key]));
  const groups = ["budget", "scores", "timings"];
  const out = {};
  for (const group of groups) {
    out[group] = {};
    for (const key of Object.keys(extracts[0][group])) {
      const value = pick(group, key);
      // Byte and request counts are whole numbers; an even-count median can
      // land on .5 and it would only ever be noise in the baseline.
      out[group][key] =
        group === "budget" && value !== null ? Math.round(value) : value;
    }
  }
  // The byte breakdown is only ever reported, so the first run's shape is
  // enough - but median each bucket anyway so it agrees with the gated total.
  const types = new Set(extracts.flatMap((e) => Object.keys(e.byType)));
  out.byType = {};
  for (const type of [...types].sort()) {
    out.byType[type] = {
      bytes: Math.round(
        median(extracts.map((e) => e.byType[type]?.bytes ?? 0)),
      ),
      requests: Math.round(
        median(extracts.map((e) => e.byType[type]?.requests ?? 0)),
      ),
    };
  }
  return out;
}

const chromePath = await chromeExecutable();
const { default: puppeteer } = await import("puppeteer");
const lighthouse = (await import("lighthouse")).default;
const { default: desktopConfig } =
  await import("lighthouse/core/config/desktop-config.js");

const server = externalUrl
  ? { url: externalUrl.replace(/\/$/, ""), stop: () => {} }
  : await startPreview();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  // --no-sandbox is required in the unprivileged CI container; the pages under
  // audit are our own build served from localhost, so there is no untrusted
  // content to contain. --disable-dev-shm-usage keeps Chrome off the 64MB
  // /dev/shm that container runtimes hand out, which otherwise crashes tabs.
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const endpointPort = Number(new URL(browser.wsEndpoint()).port);

const summary = {
  generatedAt: new Date().toISOString(),
  lighthouseVersion: null,
  chrome: null,
  runs,
  baseUrl: server.url,
  routes: {},
};

/**
 * One Lighthouse pass over `url`.
 *
 * `withHtml` additionally renders Lighthouse's own browsable report. Only the
 * first run of each route asks for it: the HTML is a few MB and every run says
 * the same thing about the bytes, so six copies would bloat the CI artifact for
 * nothing.
 */
async function audit(url, withHtml = false) {
  return lighthouse(
    url,
    {
      port: endpointPort,
      output: withHtml ? ["json", "html"] : "json",
      logLevel: "error",
    },
    desktopConfig,
  );
}

let failure = null;
try {
  // Discarded warm-up. The first navigation of a browser session fetches a
  // locale file the later ones do not, which put run 1 of the first route
  // 440 KiB above runs 2-4 - enough on its own to trip the byte budget. One
  // throwaway pass moves that cost outside the measured runs.
  await audit(`${server.url}${routes[0].path}`);

  for (const route of routes) {
    const url = `${server.url}${route.path}`;
    const extracts = [];
    process.stdout.write(`lighthouse: ${route.id.padEnd(16)} ${url}`);

    for (let i = 0; i < runs; i++) {
      const result = await audit(url, i === 0);
      const lhr = result?.lhr;
      if (!lhr) throw new Error(`${route.id}: Lighthouse returned no result`);
      // A route that errors still produces a full report - of a blank page.
      // Recording that as a baseline would quietly halve every byte budget.
      if (lhr.runtimeError?.code) {
        throw new Error(
          `${route.id}: page failed to load - ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`,
        );
      }
      summary.lighthouseVersion ??= lhr.lighthouseVersion;
      summary.chrome ??= lhr.environment?.hostUserAgent ?? null;
      extracts.push(extract(lhr));
      // An output array comes back as an array of reports, in the order asked.
      const [json, html] = Array.isArray(result.report)
        ? result.report
        : [result.report];
      writeFileSync(join(outDir, `${route.id}.run${i + 1}.json`), json);
      if (html) writeFileSync(join(outDir, `${route.id}.html`), html);
      process.stdout.write(".");
    }

    const merged = medianExtracts(extracts);
    summary.routes[route.id] = {
      path: route.path,
      label: route.label,
      ...merged,
    };
    process.stdout.write(
      ` ${(merged.budget.totalBytes / 1024).toFixed(0)} KiB / ${merged.budget.requests} reqs\n`,
    );
  }
} catch (error) {
  failure = error;
} finally {
  await browser.close();
  server.stop();
}

if (failure) die(failure.message);

writeFileSync(
  join(outDir, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(`lighthouse: wrote ${join(outDir, "summary.json")}`);
