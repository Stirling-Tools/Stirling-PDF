// Probe: what does the UI actually cost the browser? DOM size and depth, JS
// heap, style/layout/script time, and long tasks on the landing screen.
import { chromium } from "playwright";

const ORIGIN = process.env.AUDIT_ORIGIN ?? "http://127.0.0.1:4181";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1350, height: 940 } });
await context.addInitScript(() => {
  globalThis.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      globalThis.__longTasks.push({
        start: Math.round(entry.startTime),
        duration: Math.round(entry.duration),
      });
    }
  }).observe({ type: "longtask", buffered: true });
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("HeapProfiler.enable");

const snapshot = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const values = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
  const dom = await page.evaluate(() => {
    const all = document.querySelectorAll("*");
    let deepest = 0;
    let widest = { count: 0, tag: "", cls: "" };
    const classes = new Map();
    for (const element of all) {
      let depth = 0;
      for (let node = element; node.parentElement; node = node.parentElement) depth++;
      if (depth > deepest) deepest = depth;
      const children = element.childElementCount;
      if (children > widest.count) {
        widest = {
          count: children,
          tag: element.tagName.toLowerCase(),
          cls: String(element.className).slice(0, 40),
        };
      }
      for (const name of String(element.className).split(/\s+/)) {
        if (name) classes.set(name, (classes.get(name) ?? 0) + 1);
      }
    }
    const walker = document.createTreeWalker(document.getElementById("root"), NodeFilter.SHOW_TEXT);
    let texts = 0;
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) texts++;
    const heaviest = [...classes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    return { elements: all.length, deepest, widest, texts, heaviest };
  });
  return { values, dom };
};

const report = (label, { values, dom }, longTasks) => {
  const heap = (values.JSHeapUsedSize / 1048576).toFixed(1);
  console.log(`\n== ${label}`);
  console.log(
    `   DOM ${dom.elements} elements, depth ${dom.deepest}, ${dom.texts} text nodes, ` +
      `widest ${dom.widest.tag}.${dom.widest.cls} (${dom.widest.count} children)`,
  );
  console.log(
    `   heap ${heap} MiB | nodes ${values.Nodes} listeners ${values.JSEventListeners} | ` +
      `layout ${(values.LayoutDuration * 1000).toFixed(0)}ms x${values.LayoutCount} | ` +
      `style ${(values.RecalcStyleDuration * 1000).toFixed(0)}ms x${values.RecalcStyleCount} | ` +
      `script ${(values.ScriptDuration * 1000).toFixed(0)}ms | task ${(values.TaskDuration * 1000).toFixed(0)}ms`,
  );
  const total = longTasks.reduce((sum, task) => sum + task.duration, 0);
  const worst = longTasks.reduce((max, task) => Math.max(max, task.duration), 0);
  console.log(
    `   long tasks ${longTasks.length} (${total}ms total, worst ${worst}ms) ` +
      `${longTasks.map((task) => `${task.start}:${task.duration}`).join(" ") || "-"}`,
  );
  console.log(`   heaviest classes ${dom.heaviest.map(([name, n]) => `${name}=${n}`).join(" ")}`);
};

await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
await page.waitForSelector("#root .app-frame", { timeout: 60_000 });
// The frame is chrome: the landing route arrives later, so wait for the element
// count to hold still rather than for i18next, which settles first.
await page.waitForFunction(
  () => {
    const count = document.querySelectorAll("#root *").length;
    globalThis.__stable = count === globalThis.__last ? (globalThis.__stable ?? 0) + 1 : 0;
    globalThis.__last = count;
    return globalThis.__stable >= 6;
  },
  null,
  { timeout: 60_000, polling: 250 },
);
const loaded = await snapshot();
const loadedTasks = await page.evaluate(() => globalThis.__longTasks);

// Tool entries are Mantine UnstyledButtons, so the clickable thing is an
// ancestor of the label rather than a <button>.
const pick = await page.evaluate(() => {
  const label = [...document.querySelectorAll("#root *")].find(
    (element) =>
      element.childElementCount === 0 &&
      /^(Merge|Split|Compress|Rotate|OCR)$/i.test((element.textContent ?? "").trim()),
  );
  const target = label?.closest('button,[role="button"],a,label');
  if (!target) return null;
  target.setAttribute("data-probe-click", "");
  return `${label.textContent.trim()} -> ${target.tagName.toLowerCase()}`;
});

const countBefore = await page.evaluate(() => document.querySelectorAll("#root *").length);
const before = performance.now();
if (pick) {
  await page.click("[data-probe-click]");
  await page.waitForFunction(
    (previous) =>
      document.querySelector("[data-probe-click]")?.getAttribute("aria-pressed") === "true" ||
      document.querySelectorAll("#root *").length !== previous,
    countBefore,
    { timeout: 15_000 },
  ).catch(() => undefined);
}
const interactionMs = Math.round(performance.now() - before);
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const after = await snapshot();
const afterTasks = await page.evaluate(() => globalThis.__longTasks);

report("landing (cold load)", loaded, loadedTasks);
report(`after selecting a tool (${pick ?? "no button found"}, ${interactionMs}ms)`, after, afterTasks.slice(loadedTasks.length));

await browser.close();
