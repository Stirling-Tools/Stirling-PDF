import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, join, normalize, extname } from "node:path";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

async function startStaticServer(distDir) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let filePath = resolve(
      distDir,
      normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, ""),
    );
    try {
      if ((await stat(filePath)).isDirectory())
        filePath = join(filePath, "index.html");
    } catch {
      filePath = join(distDir, "index.html");
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        "content-type":
          CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not Found");
    }
  });

  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      done({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((c) => server.close(c)),
      });
    });
  });
}

function scoreRating(metric, value) {
  if (metric === "FCP")
    return value <= 1800
      ? "GOOD"
      : value <= 3000
        ? "NEEDS_IMPROVEMENT"
        : "POOR";
  if (metric === "LCP")
    return value <= 2500
      ? "GOOD"
      : value <= 4000
        ? "NEEDS_IMPROVEMENT"
        : "POOR";
  if (metric === "CLS")
    return value <= 0.1 ? "GOOD" : value <= 0.25 ? "NEEDS_IMPROVEMENT" : "POOR";
  if (metric === "TBT")
    return value <= 200 ? "GOOD" : value <= 600 ? "NEEDS_IMPROVEMENT" : "POOR";
  if (metric === "INP")
    return value <= 200 ? "GOOD" : value <= 500 ? "NEEDS_IMPROVEMENT" : "POOR";
  return "N/A";
}

async function runBenchmarkForDevice({ name, viewport, isMobile, serverUrl }) {
  console.log(`\n========================================`);
  console.log(
    ` Running Benchmark: ${name} (${viewport.width}x${viewport.height})`,
  );
  console.log(`========================================`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    userAgent: isMobile
      ? "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      : undefined,
  });

  // Playwright is a WebDriver browser, and the shell boots immediately for
  // WebDriver so tests never wait on a gesture. Disable that signal and give
  // the static server the flag Spring would inject, or this measures the app
  // after an early boot instead of the prerendered shell.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    window.STIRLING_PDF_ENABLE_LOGIN = false;
  });
  const page = await context.newPage();

  const consoleWarnings = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning" || msg.type() === "error") {
      consoleWarnings.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  const requests = [];
  page.on("request", (req) => {
    requests.push({ url: req.url(), resourceType: req.resourceType() });
  });

  // Inject performance observer before navigation
  await page.addInitScript(() => {
    window.__perfEntries = {
      lcp: [],
      cls: 0,
      clsEntries: [],
      longTasks: [],
      fcp: 0,
      ttfb: 0,
    };

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        window.__perfEntries.lcp.push({
          startTime: entry.startTime,
          size: entry.size,
          element: entry.element
            ? entry.element.tagName +
              (entry.element.className
                ? "." + entry.element.className.replace(/\s+/g, ".")
                : "")
            : "unknown",
        });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__perfEntries.cls += entry.value;
          window.__perfEntries.clsEntries.push({
            value: entry.value,
            startTime: entry.startTime,
          });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        window.__perfEntries.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    }).observe({ type: "longtask", buffered: true });
  });

  const response = await page.goto(serverUrl, {
    waitUntil: "domcontentloaded",
  });
  if (!response || !response.ok()) {
    throw new Error(
      `Failed to load production build at ${serverUrl}: HTTP ${response ? response.status() : "no response"}`,
    );
  }

  // 1. Initial Shell metrics (before user interaction)
  await page.waitForTimeout(100);

  const initialMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint");
    const fcpEntry = paints.find((p) => p.name === "first-contentful-paint");
    // The wide shell is display:none on phones; any visible variant counts.
    const shellVisible = [
      ...document.querySelectorAll("[data-shell-for]"),
    ].some((element) => getComputedStyle(element).display !== "none");
    const wordmark = document.querySelector(".sui-logo__wordmark");

    return {
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
      fcp: fcpEntry ? Math.round(fcpEntry.startTime) : 0,
      shellVisible: Boolean(shellVisible),
      wordmarkPresent: Boolean(wordmark),
      lcpEntries: window.__perfEntries.lcp,
      cls: window.__perfEntries.cls,
      longTasks: window.__perfEntries.longTasks,
    };
  });

  console.log(`Initial Paint & Shell State:`);
  console.log(`  - TTFB: ${initialMetrics.ttfb} ms`);
  console.log(`  - FCP: ${initialMetrics.fcp} ms`);
  console.log(`  - Prerender Shell active: ${initialMetrics.shellVisible}`);
  console.log(
    `  - Wordmark logo in DOM at FCP: ${initialMetrics.wordmarkPresent}`,
  );
  if (initialMetrics.lcpEntries.length > 0) {
    const latestLcp =
      initialMetrics.lcpEntries[initialMetrics.lcpEntries.length - 1];
    console.log(
      `  - Initial LCP: ${Math.round(latestLcp.startTime)} ms (element: <${latestLcp.element}>)`,
    );
  }

  // 2. User interaction & React boot
  const preGestureRequests = requests.length;
  console.log(`\nSimulating User Input (typing in search bar and clicking)...`);
  const interactionStart = Date.now();

  const searchInput = page.locator("input#super-search-input:visible").first();
  let inputPreserved = false;
  if ((await searchInput.count()) > 0) {
    await searchInput.focus();
    await page.keyboard.type("cat", { delay: 10 });
    await page.waitForFunction(
      () => !document.querySelector("[data-shell-for]"),
      { timeout: 15000 },
    );
    const postVal = await page.evaluate(() => {
      const el = document.getElementById("super-search-input");
      return el ? el.value : "";
    });
    inputPreserved = Boolean(postVal && postVal.length > 0);
    console.log(
      `  - User search input preserved after boot: ${inputPreserved} (value: "${postVal}")`,
    );
  } else {
    await page.dispatchEvent("body", "pointerdown");
    await page.waitForFunction(
      () => !document.querySelector("[data-shell-for]"),
      { timeout: 15000 },
    );
  }

  const bootDuration = Date.now() - interactionStart;
  console.log(`  - React booted and replaced shell in: ${bootDuration} ms`);

  // Allow layout shifts and long tasks to settle post-boot
  await page.waitForTimeout(500);

  const finalMetrics = await page.evaluate(() => {
    const paints = performance.getEntriesByType("paint");
    const fcpEntry = paints.find((p) => p.name === "first-contentful-paint");
    const fcpTime = fcpEntry ? fcpEntry.startTime : 0;
    const totalTBT = window.__perfEntries.longTasks.reduce((sum, task) => {
      if (task.startTime < fcpTime) return sum;
      return sum + Math.max(0, task.duration - 50);
    }, 0);

    const latestLcp =
      window.__perfEntries.lcp.length > 0
        ? window.__perfEntries.lcp[window.__perfEntries.lcp.length - 1]
        : null;

    return {
      fcp: fcpEntry ? Math.round(fcpEntry.startTime) : 0,
      lcp: latestLcp ? Math.round(latestLcp.startTime) : 0,
      lcpElement: latestLcp ? latestLcp.element : "none",
      cls: Number(window.__perfEntries.cls.toFixed(4)),
      tbt: Math.round(totalTBT),
      longTasksCount: window.__perfEntries.longTasks.length,
    };
  });

  const summary = [
    {
      Metric: "FCP (First Contentful Paint)",
      Value: `${finalMetrics.fcp} ms`,
      Status: scoreRating("FCP", finalMetrics.fcp),
    },
    {
      Metric: "LCP (Largest Contentful Paint)",
      Value: `${finalMetrics.lcp} ms`,
      Status: scoreRating("LCP", finalMetrics.lcp),
    },
    { Metric: "LCP Element", Value: finalMetrics.lcpElement, Status: "INFO" },
    {
      Metric: "CLS (Cumulative Layout Shift)",
      Value: `${finalMetrics.cls}`,
      Status: scoreRating("CLS", finalMetrics.cls),
    },
    {
      Metric: "TBT (Total Blocking Time)",
      Value: `${finalMetrics.tbt} ms`,
      Status: scoreRating("TBT", finalMetrics.tbt),
    },
    {
      Metric: "React Boot Duration",
      Value: `${bootDuration} ms`,
      Status: "INFO",
    },
    {
      Metric: "Requests Fired Before Gesture",
      Value: `${preGestureRequests}`,
      Status: preGestureRequests <= 15 ? "GOOD" : "REVIEW",
    },
  ];

  console.table(summary);

  if (consoleWarnings.length > 0) {
    console.log("\nConsole warnings/errors detected during run:");
    consoleWarnings.forEach((w) => console.log("  ", w));
  } else {
    console.log(
      "\nNo console warnings or preload mismatch errors detected! Clean run.",
    );
  }

  await browser.close();
  return { summary, finalMetrics, warnings: consoleWarnings };
}

async function main() {
  const distDir = resolve("frontend/editor/dist");
  const server = await startStaticServer(distDir);
  console.log(`Static production preview server started at: ${server.origin}`);

  try {
    // 1. Desktop Profile
    await runBenchmarkForDevice({
      name: "Desktop (Standard)",
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      serverUrl: server.origin,
    });

    // 2. Mobile Profile (Simulates responsive shell handoff)
    await runBenchmarkForDevice({
      name: "Mobile (Pixel 7)",
      viewport: { width: 412, height: 915 },
      isMobile: true,
      serverUrl: server.origin,
    });
  } finally {
    await server.close();
    console.log("\nBenchmark complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
