// Generate branded Open Graph cards (1200x630) that match the existing
// public/og_images tool cards. Renders an HTML template with Puppeteer.
//
// Usage:
//   node scripts/generate-og-image.mjs --missing      # generate cards for every tool with no art
//   node scripts/generate-og-image.mjs --name "Add Text" --desc "Add custom text anywhere" \
//        --icon text-fields --out public/og_images/add-text.png
//   # theme overrides, e.g. a different accent:
//   node scripts/generate-og-image.mjs --name "Sign" --icon draw --bg-top "#1e3a5f" \
//        --bg-bottom "#3b6ea5" --rotate -3 --out /path/sign.png
//
// --icon is a material-symbols name (https://fonts.google.com/icons) resolved via iconify,
// or a raw "<svg…>" string. Theme is fully customizable (see THEME / the CLI flags below).
// After adding images, run `node scripts/generate-og-metadata.mjs` so they get picked up.

/* global document, getComputedStyle */ // used inside page.evaluate (browser context)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

// ---- theme (override any of these via CLI flags) ---------------------------
export const THEME = {
  width: 1200,
  height: 630,
  // background red gradient (sampled from the originals)
  bgTop: "#7b2727",
  bgMid: "#b3352e",
  bgBottom: "#c64040",
  bgAngle: 162, // deg
  // white diagonal in the top-right; vertices (cutTopX,0) (W,0) (W,cutRightY)
  cutTopX: 527,
  cutRightY: 345,
  // the tilted "paper" card holding the icon + text
  cardLeft: 36,
  cardTop: 6,
  cardWidth: 580,
  cardHeight: 640,
  cardRadius: 5, // a tilted "sheet of paper": near-sharp corners, not a rounded box
  cardRotate: -4.5, // deg (counter-clockwise)
  cardPadLeft: 78,
  cardPadTop: 182,
  cardFill: "rgba(255,255,255,0.045)",
  cardBorder: "rgba(255,255,255,0.085)",
  // icon
  iconBox: 120,
  iconBoxRadius: 26,
  iconBoxFill: "rgba(0,0,0,0.07)",
  iconSize: 80,
  // text
  textColor: "#ffffff",
  titleSize: 70,
  titleWeight: 900,
  titleSpacing: -1,
  titleMaxWidth: 485, // title wrap width; long names wrap to 2 lines, then shrink
  descSize: 30,
  descWeight: 600,
  descMaxWidth: 455,
  gapIconTitle: 30,
  gapTitleDesc: 16,
  fontFamily: "Nunito",
  fontUrl:
    "https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;900&display=swap",
};

// ---- icon resolution (material-symbols via iconify) ------------------------
function resolveIcon(icon) {
  if (!icon) return "";
  if (icon.trim().startsWith("<svg")) return icon; // raw svg passed through
  const { getIconData, iconToSVG } = require("@iconify/utils");
  const set = require("@iconify-json/material-symbols/icons.json");
  const data = getIconData(set, icon);
  if (!data) throw new Error(`icon not found in material-symbols: "${icon}"`);
  const { attributes, body } = iconToSVG(data);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${attributes.viewBox}" style="color:#fff">${body}</svg>`;
}

// ---- html template ---------------------------------------------------------
async function buildHtml({ name, description, iconSvg, theme }) {
  const t = theme;
  const lockup = await fs.readFile(
    path.join(HERE, "og-assets/stirling-lockup.png"),
  );
  const lockupUri = `data:image/png;base64,${lockup.toString("base64")}`;
  return `<!doctype html><html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="${t.fontUrl}" rel="stylesheet" />
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${t.width}px; height: ${t.height}px; }
  .stage {
    position: relative; width: ${t.width}px; height: ${t.height}px; overflow: hidden;
    background: linear-gradient(${t.bgAngle}deg, ${t.bgTop} 0%, ${t.bgMid} 52%, ${t.bgBottom} 100%);
    font-family: "${t.fontFamily}", system-ui, sans-serif;
  }
  .whiteTri {
    position: absolute; inset: 0; background: #fff;
    clip-path: polygon(${t.cutTopX}px 0, ${t.width + 1}px 0, ${t.width + 1}px ${t.cutRightY}px);
  }
  .lockup { position: absolute; top: 42px; left: 895px; width: 295px; height: auto; }
  .cardGroup {
    position: absolute; left: ${t.cardLeft}px; top: ${t.cardTop}px;
    transform: rotate(${t.cardRotate}deg); transform-origin: 40% 50%;
  }
  .card {
    width: ${t.cardWidth}px; height: ${t.cardHeight}px; border-radius: ${t.cardRadius}px;
    background: ${t.cardFill}; border: 1px solid ${t.cardBorder};
    padding: ${t.cardPadTop}px 0 0 ${t.cardPadLeft}px;
  }
  .iconBox {
    width: ${t.iconBox}px; height: ${t.iconBox}px; border-radius: ${t.iconBoxRadius}px;
    background: ${t.iconBoxFill}; display: flex; align-items: center; justify-content: center;
  }
  .iconBox svg { width: ${t.iconSize}px; height: ${t.iconSize}px; }
  .title {
    margin-top: ${t.gapIconTitle}px; color: ${t.textColor};
    font-size: ${t.titleSize}px; font-weight: ${t.titleWeight};
    line-height: 1.06; letter-spacing: ${t.titleSpacing}px;
    max-width: ${t.titleMaxWidth}px;
  }
  .desc {
    margin-top: ${t.gapTitleDesc}px; color: ${t.textColor}; opacity: 0.96;
    font-size: ${t.descSize}px; font-weight: ${t.descWeight};
    line-height: 1.3; max-width: ${t.descMaxWidth}px;
  }
</style></head>
<body><div class="stage">
  <div class="whiteTri"></div>
  <img class="lockup" src="${lockupUri}" />
  <div class="cardGroup"><div class="card">
    <div class="iconBox">${iconSvg}</div>
    <div class="title">${escapeHtml(name)}</div>
    <div class="desc">${escapeHtml(description)}</div>
  </div></div>
</div></body></html>`;
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- render ----------------------------------------------------------------
let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  const puppeteer = require("puppeteer");
  _browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"],
  });
  return _browser;
}

export async function renderOgCard({
  name,
  description,
  icon,
  outFile,
  theme = THEME,
}) {
  const iconSvg = resolveIcon(icon);
  const html = await buildHtml({ name, description, iconSvg, theme });
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({
    width: theme.width,
    height: theme.height,
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "networkidle0" });
  const fit = await page.evaluate(
    async (family, weight, lineH, maxLines, minSize) => {
      const el = document.querySelector(".title");
      // Force the actual web font (this exact weight) to load before measuring,
      // else wrapping/height is computed against the fallback font.
      try {
        await document.fonts.load(`${weight} 80px "${family}"`);
        await document.fonts.ready;
      } catch {
        /* best-effort font preload */
      }
      // The title wraps within its max-width. Shrink only if it would exceed
      // maxLines lines, so long names wrap to 2 lines instead of spilling off.
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (size > minSize && el.offsetHeight > maxLines * lineH * size + 2) {
        size -= 1;
        el.style.fontSize = size + "px";
      }
      return { size, lines: Math.round(el.offsetHeight / (lineH * size)) };
    },
    theme.fontFamily,
    theme.titleWeight,
    1.06,
    2,
    40,
  );
  if (process.env.OG_DEBUG) console.log("  fit:", JSON.stringify(fit));
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await page.screenshot({ path: outFile, type: "png" });
  await page.close();
  return outFile;
}

export async function closeBrowser() {
  if (_browser) await _browser.close();
  _browser = null;
}

// ---- batch: generate cards for tools that currently have no bespoke art ----
// material-symbols icon per tool (the white glyph shown in the card).
const MISSING_TOOL_ICONS = {
  addText: "title",
  annotate: "draw",
  timestampPdf: "schedule",
  bookletImposition: "menu-book-outline",
  pdfTextEditor: "edit-document-outline",
  formFill: "ballot-outline",
  devApi: "api",
  devFolderScanning: "folder-open-outline",
  devSsoGuide: "key-outline",
  devAirgapped: "cloud-off-outline",
};

const kebab = (id) => id.replace(/([A-Z])/g, "-$1").toLowerCase();

// English name/description live next to each tool as the `t(key, fallback)` default.
function readRegistryStrings() {
  const src = require("node:fs").readFileSync(
    path.join(ROOT, "src/core/data/useTranslatedToolRegistry.tsx"),
    "utf8",
  );
  const STR = '"((?:[^"\\\\]|\\\\.)*)"';
  const titles = {},
    descs = {};
  for (const m of src.matchAll(
    new RegExp('t\\(\\s*"home\\.([A-Za-z0-9_]+)\\.title"\\s*,\\s*' + STR, "g"),
  ))
    titles[m[1]] = m[2];
  for (const m of src.matchAll(
    new RegExp('t\\(\\s*"home\\.([A-Za-z0-9_]+)\\.desc"\\s*,\\s*' + STR, "g"),
  ))
    descs[m[1]] = m[2];
  return { titles, descs };
}

export async function generateMissing(theme = THEME) {
  const { titles, descs } = readRegistryStrings();
  const results = [];
  for (const [id, icon] of Object.entries(MISSING_TOOL_ICONS)) {
    const out = path.join(ROOT, `public/og_images/${kebab(id)}.png`);
    await renderOgCard({
      name: titles[id] || id,
      description: descs[id] || "",
      icon,
      outFile: out,
      theme,
    });
    results.push(`${id} -> public/og_images/${kebab(id)}.png  (${icon})`);
  }
  return results;
}

// Each tool's app icon lives as `icon="<material-symbol>"` just before its
// `name: t("home.<id>.title", …)`. Pair each title with the closest preceding icon.
function readRegistryIcons() {
  const src = require("node:fs").readFileSync(
    path.join(ROOT, "src/core/data/useTranslatedToolRegistry.tsx"),
    "utf8",
  );
  const icons = [...src.matchAll(/icon="([^"]+)"/g)].map((m) => ({
    pos: m.index,
    name: m[1],
  }));
  const byId = {};
  for (const m of src.matchAll(
    /name:\s*t\(\s*"home\.([A-Za-z0-9_]+)\.title"/g,
  )) {
    let best = null;
    for (const ic of icons)
      if (ic.pos < m.index && (!best || ic.pos > best.pos)) best = ic;
    if (best) byId[m[1]] = best.name;
  }
  return byId;
}

function iconExists(name) {
  if (!name) return false;
  try {
    const { getIconData } = require("@iconify/utils");
    return !!getIconData(
      require("@iconify-json/material-symbols/icons.json"),
      name,
    );
  } catch {
    return false;
  }
}

// First candidate that resolves; also tries dropping a "-rounded" suffix.
function firstResolvableIcon(candidates) {
  for (const c of candidates) {
    if (iconExists(c)) return c;
    const alt = c && c.replace(/-rounded$/, "");
    if (alt && alt !== c && iconExists(alt)) return alt;
  }
  return "description-outline";
}

const humanizeId = (id) =>
  id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();

// Regenerate a card for EVERY tool that has an image, so the whole set is one
// consistent style. Writes to each tool's existing filename (from ogImageMap).
export async function generateAll(theme = THEME) {
  const { titles, descs } = readRegistryStrings();
  const regIcons = readRegistryIcons();
  const ogMap = JSON.parse(
    require("node:fs").readFileSync(
      path.join(ROOT, "src/core/data/ogImageMap.json"),
      "utf8",
    ),
  );
  const results = [];
  for (const [id, basename] of Object.entries(ogMap)) {
    const icon = firstResolvableIcon([regIcons[id], MISSING_TOOL_ICONS[id]]);
    await renderOgCard({
      name: titles[id] || humanizeId(id),
      description: descs[id] || "",
      icon,
      outFile: path.join(ROOT, `public/og_images/${basename}.png`),
      theme,
    });
    results.push(`${id.padEnd(20)} -> ${basename}.png  (${icon})`);
  }
  return results;
}

// ---- CLI -------------------------------------------------------------------
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      a[k] = v;
    }
  }
  return a;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("generate-og-image.mjs")
) {
  const a = parseArgs(process.argv.slice(2));
  const theme = { ...THEME };
  for (const [flag, key] of Object.entries({
    "bg-top": "bgTop",
    "bg-mid": "bgMid",
    "bg-bottom": "bgBottom",
    rotate: "cardRotate",
    "title-size": "titleSize",
    font: "fontFamily",
  })) {
    if (a[flag] != null) theme[key] = isNaN(+a[flag]) ? a[flag] : +a[flag];
  }
  const run = async () => {
    if (a.all) {
      const results = await generateAll(theme);
      console.log(
        `Regenerated ${results.length} tool cards:\n  ` + results.join("\n  "),
      );
    } else if (a.missing) {
      const results = await generateMissing(theme);
      console.log(
        "Generated cards for tools with no bespoke art:\n  " +
          results.join("\n  "),
      );
    } else if (a.name) {
      const out =
        a.out ||
        `public/og_images/${a.name.toLowerCase().replace(/\s+/g, "-")}.png`;
      await renderOgCard({
        name: a.name,
        description: a.desc || "",
        icon: a.icon,
        outFile: path.resolve(ROOT, out),
        theme,
      });
      console.log("wrote", out);
    } else {
      console.error(
        "Provide --missing, or --name (and --desc, --icon, --out). See header for usage.",
      );
      process.exitCode = 1;
    }
    await closeBrowser();
  };
  run().catch(async (e) => {
    console.error(e);
    await closeBrowser();
    process.exit(1);
  });
}
