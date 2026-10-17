import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The drawings the landing screen paints, and the generator for their markup.
 *
 * These arrived as React components through the `?react` transform, which
 * copies each svg's root attributes into the bundle once per icon. The shared
 * root in `StartupIcon.tsx` carries them instead, so what is generated here is
 * the drawings' own markup and where each name finds it.
 *
 * After changing this table, run `npx tsx scripts/icons/generate-startup-icons.mjs`
 * from `frontend`; the freshness test in `src/core/icons` fails on drift.
 */

/** The viewBox every drawing shares with the root in `StartupIcon.tsx`. */
const VIEW_BOX = "0 0 24 24";

const LUCIDE = "lucide-static/icons/";
const OUR_DRAWINGS = "@app/icons/svg/stirling/";

const EDITOR_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FRONTEND_ROOT = resolve(EDITOR_ROOT, "..");

/** @type {{ heading: string, kinds: import("./startupIcons.d.mts").StartupIconKind[] }[]} */
const GROUPS = [
  { heading: "lucide-static", kinds: ["lucide"] },
  { heading: "our drawings", kinds: ["stirling", "brand"] },
];

/** @type {import("./startupIcons.d.mts").StartupIconSource[]} */
export const STARTUP_ICON_SOURCES = [
  {
    name: "annotation-off",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/annotation-off.svg",
  },
  {
    name: "automate",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/automate.svg",
  },
  { name: "award", kind: "lucide", specifier: "lucide-static/icons/award.svg" },
  {
    name: "badge-check",
    kind: "lucide",
    specifier: "lucide-static/icons/badge-check.svg",
  },
  { name: "bell", kind: "lucide", specifier: "lucide-static/icons/bell.svg" },
  {
    name: "book-open",
    kind: "lucide",
    specifier: "lucide-static/icons/book-open.svg",
  },
  {
    name: "braces",
    kind: "lucide",
    specifier: "lucide-static/icons/braces.svg",
  },
  {
    name: "brush-cleaning",
    kind: "lucide",
    specifier: "lucide-static/icons/brush-cleaning.svg",
  },
  {
    name: "circle-dashed",
    kind: "lucide",
    specifier: "lucide-static/icons/circle-dashed.svg",
  },
  {
    name: "circle-question-mark",
    kind: "lucide",
    specifier: "lucide-static/icons/circle-question-mark.svg",
  },
  {
    name: "clipboard-check",
    kind: "lucide",
    specifier: "lucide-static/icons/clipboard-check.svg",
  },
  {
    name: "clipboard-list",
    kind: "lucide",
    specifier: "lucide-static/icons/clipboard-list.svg",
  },
  { name: "clock", kind: "lucide", specifier: "lucide-static/icons/clock.svg" },
  {
    name: "copy-plus",
    kind: "lucide",
    specifier: "lucide-static/icons/copy-plus.svg",
  },
  { name: "crop", kind: "lucide", specifier: "lucide-static/icons/crop.svg" },
  {
    name: "external-link",
    kind: "lucide",
    specifier: "lucide-static/icons/external-link.svg",
  },
  {
    name: "file-convert",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/file-convert.svg",
  },
  {
    name: "file-digit",
    kind: "lucide",
    specifier: "lucide-static/icons/file-digit.svg",
  },
  {
    name: "file-lock-open",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/file-lock-open.svg",
  },
  {
    name: "file-text",
    kind: "lucide",
    specifier: "lucide-static/icons/file-text.svg",
  },
  {
    name: "file-up",
    kind: "lucide",
    specifier: "lucide-static/icons/file-up.svg",
  },
  {
    name: "file-x",
    kind: "lucide",
    specifier: "lucide-static/icons/file-x.svg",
  },
  {
    name: "folder",
    kind: "lucide",
    specifier: "lucide-static/icons/folder.svg",
  },
  {
    name: "folder-plus",
    kind: "lucide",
    specifier: "lucide-static/icons/folder-plus.svg",
  },
  {
    name: "form-input",
    kind: "lucide",
    specifier: "lucide-static/icons/form-input.svg",
  },
  {
    name: "form-scan",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/form-scan.svg",
  },
  {
    name: "git-branch",
    kind: "lucide",
    specifier: "lucide-static/icons/git-branch.svg",
  },
  { name: "image", kind: "lucide", specifier: "lucide-static/icons/image.svg" },
  {
    name: "image-compare",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/image-compare.svg",
  },
  {
    name: "images",
    kind: "lucide",
    specifier: "lucide-static/icons/images.svg",
  },
  {
    name: "layers-minus",
    kind: "lucide",
    specifier: "lucide-static/icons/layers-minus.svg",
  },
  {
    name: "layout-dashboard",
    kind: "lucide",
    specifier: "lucide-static/icons/layout-dashboard.svg",
  },
  {
    name: "layout-grid",
    kind: "lucide",
    specifier: "lucide-static/icons/layout-grid.svg",
  },
  {
    name: "library",
    kind: "lucide",
    specifier: "lucide-static/icons/library.svg",
  },
  { name: "lock", kind: "lucide", specifier: "lucide-static/icons/lock.svg" },
  {
    name: "lock-open-password",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/lock-open-password.svg",
  },
  {
    name: "maximize-2",
    kind: "lucide",
    specifier: "lucide-static/icons/maximize-2.svg",
  },
  {
    name: "move-item-down",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/move-item-down.svg",
  },
  {
    name: "overlay-pages",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/overlay-pages.svg",
  },
  {
    name: "paint-bucket",
    kind: "lucide",
    specifier: "lucide-static/icons/paint-bucket.svg",
  },
  {
    name: "palette",
    kind: "lucide",
    specifier: "lucide-static/icons/palette.svg",
  },
  {
    name: "paperclip",
    kind: "lucide",
    specifier: "lucide-static/icons/paperclip.svg",
  },
  {
    name: "password",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/password.svg",
  },
  {
    name: "pen-tool",
    kind: "lucide",
    specifier: "lucide-static/icons/pen-tool.svg",
  },
  {
    name: "pencil",
    kind: "lucide",
    specifier: "lucide-static/icons/pencil.svg",
  },
  { name: "plus", kind: "lucide", specifier: "lucide-static/icons/plus.svg" },
  {
    name: "redact",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/redact.svg",
  },
  {
    name: "remove-selection",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/remove-selection.svg",
  },
  {
    name: "rotate-cw",
    kind: "lucide",
    specifier: "lucide-static/icons/rotate-cw.svg",
  },
  {
    name: "rotate-cw-square",
    kind: "lucide",
    specifier: "lucide-static/icons/rotate-cw-square.svg",
  },
  {
    name: "rows-3",
    kind: "lucide",
    specifier: "lucide-static/icons/rows-3.svg",
  },
  { name: "scan", kind: "lucide", specifier: "lucide-static/icons/scan.svg" },
  {
    name: "scan-text",
    kind: "lucide",
    specifier: "lucide-static/icons/scan-text.svg",
  },
  {
    name: "scissors",
    kind: "lucide",
    specifier: "lucide-static/icons/scissors.svg",
  },
  {
    name: "search",
    kind: "lucide",
    specifier: "lucide-static/icons/search.svg",
  },
  {
    name: "settings",
    kind: "lucide",
    specifier: "lucide-static/icons/settings.svg",
  },
  {
    name: "shield-off",
    kind: "lucide",
    specifier: "lucide-static/icons/shield-off.svg",
  },
  {
    name: "shrink",
    kind: "lucide",
    specifier: "lucide-static/icons/shrink.svg",
  },
  {
    name: "signature",
    kind: "lucide",
    specifier: "lucide-static/icons/signature.svg",
  },
  {
    name: "single-page",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/single-page.svg",
  },
  {
    name: "sliders-horizontal",
    kind: "lucide",
    specifier: "lucide-static/icons/sliders-horizontal.svg",
  },
  {
    name: "square-pen",
    kind: "lucide",
    specifier: "lucide-static/icons/square-pen.svg",
  },
  { name: "stamp", kind: "lucide", specifier: "lucide-static/icons/stamp.svg" },
  { name: "star", kind: "lucide", specifier: "lucide-static/icons/star.svg" },
  {
    name: "stirling-mark",
    kind: "brand",
    specifier: "@app/icons/svg/stirling/stirling-mark.svg",
  },
  {
    name: "table-columns-split",
    kind: "lucide",
    specifier: "lucide-static/icons/table-columns-split.svg",
  },
  {
    name: "table-of-contents",
    kind: "lucide",
    specifier: "lucide-static/icons/table-of-contents.svg",
  },
  { name: "trash", kind: "lucide", specifier: "lucide-static/icons/trash.svg" },
  { name: "type", kind: "lucide", specifier: "lucide-static/icons/type.svg" },
  {
    name: "upload",
    kind: "lucide",
    specifier: "lucide-static/icons/upload.svg",
  },
  {
    name: "watermark",
    kind: "stirling",
    specifier: "@app/icons/svg/stirling/watermark.svg",
  },
  {
    name: "whole-word",
    kind: "lucide",
    specifier: "lucide-static/icons/whole-word.svg",
  },
  {
    name: "wrench",
    kind: "lucide",
    specifier: "lucide-static/icons/wrench.svg",
  },
];

/** @param {string} specifier */
function sourceFile(specifier) {
  if (specifier.startsWith(LUCIDE))
    return resolve(FRONTEND_ROOT, "node_modules", specifier);
  if (specifier.startsWith(OUR_DRAWINGS)) {
    return resolve(
      EDITOR_ROOT,
      "src/core/icons/svg/stirling",
      specifier.slice(OUR_DRAWINGS.length),
    );
  }
  throw new Error(`unknown icon source: ${specifier}`);
}

/**
 * The drawing's own markup, without the comments and indentation around it.
 *
 * Dropping whitespace between tags is only safe while no drawing holds text or a
 * style block, so that is checked instead of assumed: an icon that grew one
 * would otherwise change shape in the bundle.
 */
/** @param {string} specifier
 * @returns {string} */
export function iconBody(specifier) {
  const file = sourceFile(specifier);
  const svg = readFileSync(file, "utf8");
  const open = svg.indexOf("<svg");
  const start = svg.indexOf(">", open);
  const end = svg.lastIndexOf("</svg>");
  if (open === -1 || start === -1 || end === -1)
    throw new Error(`${file} is not an svg`);
  const viewBox = /viewBox="([^"]*)"/.exec(svg.slice(open, start))?.[1];
  if (viewBox !== VIEW_BOX) {
    throw new Error(
      `${file}: viewBox is ${viewBox ?? "absent"}, not ${VIEW_BOX}`,
    );
  }
  const body = svg
    .slice(start + 1, end)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+\/>/g, "/>")
    .trim();
  if (/<(text|tspan|style)\b/.test(body)) {
    throw new Error(
      `${file}: its markup would not survive dropping whitespace`,
    );
  }
  return body;
}

/** @param {string} value
 * @returns {string} */
function literal(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** @returns {string} */
export function renderStartupIcons() {
  const lines = [
    "// Generated by scripts/icons/generate-startup-icons.mjs - do not edit by hand.",
    "// Each value is one drawing's own markup; the shared root in StartupIcon.tsx",
    "// carries the viewBox and the stroke attributes every one of them sets.",
    "",
    "/** The drawings the landing screen paints, so it never waits for the registry. */",
    "export const STARTUP_ICON_BODIES: Readonly<Record<string, string>> = {",
  ];
  for (const group of GROUPS) {
    lines.push(`  // ${group.heading}`);
    for (const source of STARTUP_ICON_SOURCES.filter((s) =>
      group.kinds.includes(s.kind),
    )) {
      lines.push(
        `  ${JSON.stringify(source.name)}: ${literal(iconBody(source.specifier))},`,
      );
    }
  }
  const selfPainted = STARTUP_ICON_SOURCES.filter(
    (s) => s.kind === "brand",
  ).map((s) => literal(s.name));
  lines.push(
    "};",
    "",
    "/** Drawings that paint themselves: a stroke or a fill would flatten them. */",
    `export const SELF_PAINTED_ICON_NAMES: ReadonlySet<string> = new Set([${selfPainted.join(", ")}]);`,
    "",
    "/** What a name neither map can resolve draws. */",
    'export const PLACEHOLDER_ICON_BODY = STARTUP_ICON_BODIES["circle-dashed"];',
    "",
  );
  return lines.join("\n");
}
