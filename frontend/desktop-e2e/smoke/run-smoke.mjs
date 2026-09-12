#!/usr/bin/env node
// Headless desktop smoke: launch the built app, wait for its bundled backend,
// then run real tools through it.
//
// Why this exists alongside the WebDriver suite: tauri-driver has no macOS
// backend (Apple ships no WebDriver for WKWebView), so the wdio specs can only
// run on Linux and Windows. This runner never touches the webview - it reads
// the backend port off the app's stdout and talks HTTP - so it is the only
// desktop coverage that works on all three platforms. On Linux the app still
// needs a display; CI wraps this in xvfb-run.
import { spawn, spawnSync } from "node:child_process";

import { isWindows, resolveAppBinary, fixture } from "../lib/app-binary.mjs";
import {
  assertIsPdf,
  countPages,
  fetchStatus,
  mergePdfs,
  rotatePdf,
} from "../lib/backend-tools.mjs";

// Spring Boot cold start inside a jlink runtime on a cold CI runner.
const BACKEND_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 240_000);
// utils/logging.rs mirrors every add_log() to stdout; commands/backend.rs logs
// this line once the Java process reports the port the OS handed it.
const PORT_PATTERNS = [
  /backend started on port:\s*(\d+)/i,
  /running on port:\s*(\d+)/i,
];

const checks = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    checks.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ok   ${name}`);
  } catch (error) {
    checks.push({ name, ok: false, ms: Date.now() - started, error });
    console.log(
      `  FAIL ${name}\n       ${error.message.replace(/\n/g, "\n       ")}`,
    );
  }
}

function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (isWindows) {
    // The app forks the bundled java process; killing only the parent leaves
    // it holding its port.
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

function launchApp(binary) {
  const child = spawn(binary, [], { stdio: ["ignore", "pipe", "pipe"] });
  const output = [];

  let resolvePort;
  let rejectPort;
  const port = new Promise((resolve, reject) => {
    resolvePort = resolve;
    rejectPort = reject;
  });

  const scan = (chunk) => {
    const text = chunk.toString();
    output.push(text);
    for (const pattern of PORT_PATTERNS) {
      const match = text.match(pattern);
      if (match) resolvePort(Number(match[1]));
    }
  };

  child.stdout.on("data", scan);
  child.stderr.on("data", scan);
  child.on("error", rejectPort);
  child.on("exit", (code) =>
    rejectPort(new Error(`app exited early with code ${code}`)),
  );

  const timer = setTimeout(
    () =>
      rejectPort(new Error(`no backend port within ${BACKEND_TIMEOUT_MS}ms`)),
    BACKEND_TIMEOUT_MS,
  );
  port.finally(() => clearTimeout(timer)).catch(() => {});

  return { child, port, output };
}

const binary = resolveAppBinary();
console.log(`Desktop smoke on ${process.platform}`);
console.log(`Application under test: ${binary}\n`);

const { child, port: portPromise, output } = launchApp(binary);

let port;
try {
  port = await portPromise;
  console.log(`Bundled backend came up on port ${port}\n`);
} catch (error) {
  console.error(`\nApp never reported a backend port: ${error.message}`);
  console.error("--- app output ---");
  console.error(output.join("") || "(nothing captured)");
  console.error("--- end app output ---");
  killTree(child);
  process.exit(1);
}

try {
  await check("bundled JAR serves a healthy status endpoint", async () => {
    const body = await fetchStatus(port);
    if (!body.includes("UP"))
      throw new Error(`status body was: ${body.slice(0, 200)}`);
  });

  await check("server tool: rotate-pdf returns a rotated PDF", async () => {
    const result = await rotatePdf(port, fixture("sample.pdf"), 90);
    assertIsPdf(result, "rotate-pdf");
  });

  await check("JPDFium: merge-pdfs combines documents natively", async () => {
    const inputs = [
      fixture("compare_sample_a.pdf"),
      fixture("compare_sample_b.pdf"),
    ];
    const merged = await mergePdfs(port, inputs);
    assertIsPdf(merged, "merge-pdfs");

    // MergeController merges via stirling.software.jpdfium.PdfMerge and rethrows
    // any native failure as "JPDFium merge failed", so a 200 here means the
    // platform's JPDFium native loaded and ran.
    const pages = countPages(merged);
    if (pages < 2) {
      throw new Error(`merged PDF has ${pages} page(s); expected at least 2`);
    }
  });
} finally {
  killTree(child);
}

const failed = checks.filter((c) => !c.ok);
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed` +
    (failed.length
      ? ` - failing: ${failed.map((c) => c.name).join(", ")}`
      : ""),
);

if (failed.length) {
  console.error("\n--- app output ---");
  console.error(output.join("") || "(nothing captured)");
  console.error("--- end app output ---");
  process.exit(1);
}
