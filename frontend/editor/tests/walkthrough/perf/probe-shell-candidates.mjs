// Probe: which elements on the landing screen are large enough to be the LCP
// candidate, i.e. could a pre-React shell of the same DOM win the metric?
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1350, height: 940 } });
await page.goto("http://127.0.0.1:4181/", { waitUntil: "load" });
await page.waitForFunction(
  () => (document.getElementById("root")?.childElementCount ?? 0) > 0,
  null,
  { timeout: 30_000 },
);
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const area = (el) => {
    const r = el.getBoundingClientRect();
    return Math.round(r.width * r.height);
  };
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const textBearing = Array.from(document.querySelectorAll("*")).filter(
    (el) => ownText(el).length > 0,
  );
  const ranked = textBearing
    .map((el) => ({ sel: describe(el), area: area(el), text: ownText(el).slice(0, 60) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, 18);

  const pipelines = document.querySelector("p.editor-pipelines__empty");
  const root = document.getElementById("root");
  return {
    ranked,
    textNodeCount: document.querySelectorAll("*").length && (() => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n = 0;
      let node;
      while ((node = walker.nextNode())) if (node.textContent.trim()) n++;
      return n;
    })(),
    elementCount: document.querySelectorAll("*").length,
    pipelinesEmpty: pipelines
      ? { text: pipelines.textContent.trim(), rect: pipelines.getBoundingClientRect().toJSON() }
      : null,
    rootTags: Array.from(root.children).map((c) => describe(c)),
  };
});

console.log("element count:", report.elementCount);
console.log("non-empty text nodes in #root:", report.textNodeCount);
console.log("#root children:", report.rootTags.join(" | "));
console.log("pipelines empty:", JSON.stringify(report.pipelinesEmpty));
console.log("largest text-bearing elements:");
for (const r of report.ranked)
  console.log(`  ${String(r.area).padStart(8)} px2  ${r.sel}  "${r.text}"`);

await browser.close();
