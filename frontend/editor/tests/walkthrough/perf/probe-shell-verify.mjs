// Probe: does the emitted shell put the right language on screen, and does
// React replace it rather than double it? Blocking the module scripts leaves the
// resolver as the only script that ran, so the DOM then *is* the pre-React paint.
import { chromium } from "playwright";

const ORIGIN = process.env.AUDIT_ORIGIN ?? "http://127.0.0.1:4181";
const SCENARIOS = [
  { lang: "de-DE", blocked: true },
  { lang: "ar-AR", blocked: true },
  { lang: "xx-XX", blocked: true },
  { lang: "de-DE", blocked: false },
  { lang: "ar-AR", blocked: false },
];

const read = (scenario) =>
  page.evaluate((lang) => {
    const root = document.getElementById("root");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.tagName === "SCRIPT" || parent.tagName === "STYLE") continue;
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      texts.push(node.nodeValue);
    }
    const payload = document.getElementById("shell-strings");
    let strings = null;
    let parseError = null;
    let keys = null;
    try {
      const parsed = JSON.parse(payload ? payload.textContent : "");
      keys = Object.keys(parsed.strings ?? {}).length;
      const resolved = parsed.strings[lang] ? lang : navigator.language;
      strings = parsed.strings[resolved] ?? null;
      if (!strings) parseError = `no array for ${lang} or ${navigator.language}`;
    } catch (error) {
      parseError = String(error);
    }
    return {
      frames: document.querySelectorAll("#root .app-frame").length,
      pending: root.hasAttribute("data-shell"),
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      texts,
      strings,
      parseError,
      keys,
      navigator: navigator.language,
    };
  }, scenario);

const browser = await chromium.launch();
let SCENARIO = null;
let page;

for (const scenario of SCENARIOS) {
  SCENARIO = scenario.lang;
  const context = await browser.newContext({ viewport: { width: 1350, height: 940 } });
  await context.addInitScript((lang) => {
    try {
      localStorage.setItem("i18nextLng", lang);
    } catch {}
  }, scenario.lang);
  page = await context.newPage();
  if (scenario.blocked) {
    await page.route("**/assets/**/*.js", (route) => route.abort());
  }
  await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
  if (scenario.blocked) {
    await page.waitForFunction(() => !document.getElementById("root")?.hasAttribute("data-shell"), null, {
      timeout: 10_000,
    });
  } else {
    await page.waitForFunction(() => (document.getElementById("root")?.childElementCount ?? 0) > 0);
    await page.waitForTimeout(3000);
  }
  const state = await read(scenario.lang);
  const expected = Array.isArray(state.strings) ? state.strings : null;
  const filled = expected ? state.texts.join("\u0000") === expected.join("\u0000") : null;
  const first = state.texts.slice(0, 3);
  console.log(
    [
      `${scenario.lang}${scenario.blocked ? " (js blocked)" : " (mounted)"}`,
      `frames=${state.frames}`,
      `pending=${state.pending}`,
      `lang=${state.lang}`,
      `dir=${state.dir}`,
      `nodes=${state.texts.length}`,
      `keys=${state.keys}`,
      `navigator=${state.navigator}`,
      `array=${expected ? expected.length : state.parseError}`,
      `matchesArray=${filled}`,
      `first=${JSON.stringify(first)}`,
    ].join("  "),
  );
  await context.close();
}

await browser.close();
