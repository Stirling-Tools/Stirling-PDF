/**
 * Does the prerendered shell survive to the DOM, and does the resolved language
 * match the strings array? Blocks the entry module script (React never mounts)
 * so the state the resolver left behind can be inspected, and repeats over fresh
 * contexts to expose per-run variation.
 *
 *   node tests/walkthrough/perf/probe-shell.mjs [http://url] [iterations]
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4181/";
const iterations = Number(process.argv[3] ?? 8);

const browser = await chromium.launch({ args: ["--no-sandbox"] });

for (let i = 0; i < iterations; i += 1) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Keep the inline scripts (language preload, theme, resolver) and drop only
  // the deferred React entry, so the shell state stays observable.
  await page.route("**/assets/index-*.js", (route) => route.abort());
  await page.goto(url, { waitUntil: "load" });
  const state = await page.evaluate(() => {
    const root = document.getElementById("root");
    let nodes = 0;
    if (root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!parent || parent.tagName === "SCRIPT" || parent.tagName === "STYLE") continue;
        if (!node.nodeValue || !node.nodeValue.trim()) continue;
        nodes += 1;
      }
    }
    const strings = JSON.parse(document.getElementById("shell-strings").textContent);
    const first = root ? root.innerText.replace(/\s+/g, " ").trim().slice(0, 70) : null;
    return {
      navigatorLanguage: navigator.language,
      frame: Boolean(document.querySelector("[data-shell-frame]")),
      pendingAttr: root ? root.getAttribute("data-shell") : null,
      shellVisible: root && first ? first : null,
      textNodeCount: nodes,
      stringCount: strings.strings[document.documentElement.lang]?.length ?? null,
      htmlLang: document.documentElement.lang,
      htmlDir: document.documentElement.dir,
      rootChildren: root ? root.children.length : null,
    };
  });
  console.log(`run ${i + 1}`, JSON.stringify(state));
  await context.close();
}

await browser.close();
