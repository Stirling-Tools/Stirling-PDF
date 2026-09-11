/** Serves the audit's "before" glyphs as `virtual:legacy-icons`, read from the icon packages so none are checked in. */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:legacy-icons";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

const ATTR: Record<string, string> = {
  clipRule: "clip-rule",
  fillRule: "fill-rule",
  fillOpacity: "fill-opacity",
  strokeWidth: "stroke-width",
};

interface LegacyGlyph {
  viewBox: string;
  body: string;
}

interface LegacyGlyphs {
  mui: Record<string, LegacyGlyph>;
  materialSymbols: Record<string, LegacyGlyph>;
}

interface IconMap {
  mui: Record<string, string>;
  materialSymbols: Record<string, string>;
}

interface IconifySet {
  width?: number;
  height?: number;
  icons?: Record<string, { body: string; width?: number; height?: number }>;
}

/** MUI ships each icon as `createSvgIcon(_jsx("path", {…}), 'Name')`. */
function muiBody(modules: string, name: string): string | null {
  const file = path.join(modules, "@mui/icons-material", `${name}.mjs`);
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, "utf8");
  const els: string[] = [];
  const re = /_jsxs?\(\s*"([a-zA-Z]+)"\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Brace-match: an icon with several paths nests braces, and a lazy regex stops at the first inner one.
    let depth = 0;
    let end = -1;
    let inStr: string | null = null;
    for (let i = re.lastIndex - 1; i < src.length; i++) {
      const c = src[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'") inStr = c;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) continue;
    const attrs: string[] = [];
    for (const p of src
      .slice(re.lastIndex, end)
      .matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*:\s*"((?:[^"\\]|\\.)*)"/g))
      attrs.push(`${ATTR[p[1]] ?? p[1]}="${p[2].replace(/\\"/g, '"')}"`);
    if (attrs.length) els.push(`<${m[1]} ${attrs.join(" ")}/>`);
  }
  return els.length ? els.join("") : null;
}

function buildLegacyGlyphs(root: string): LegacyGlyphs {
  const modules = path.join(root, "node_modules");
  const map: IconMap = JSON.parse(
    fs.readFileSync(
      path.join(root, "editor/src/core/icons/icon-map.json"),
      "utf8",
    ),
  );
  const out: LegacyGlyphs = { mui: {}, materialSymbols: {} };

  for (const name of Object.keys(map.mui)) {
    const body = muiBody(modules, name);
    if (body) out.mui[name] = { viewBox: "0 0 24 24", body };
  }

  let symbols: IconifySet = {};
  try {
    symbols = JSON.parse(
      fs.readFileSync(
        path.join(modules, "@iconify-json/material-symbols/icons.json"),
        "utf8",
      ),
    );
  } catch {
    return out;
  }
  for (const name of Object.keys(map.materialSymbols)) {
    const icon = symbols.icons?.[name];
    if (icon) {
      out.materialSymbols[name] = {
        viewBox: `0 0 ${icon.width ?? symbols.width ?? 24} ${icon.height ?? symbols.height ?? 24}`,
        body: icon.body,
      };
    }
  }
  return out;
}

export function legacyIconsPlugin(frontendRoot: string): Plugin {
  return {
    name: "legacy-icons",
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load(id) {
      if (id !== RESOLVED_ID) return null;
      return `export default ${JSON.stringify(buildLegacyGlyphs(frontendRoot))};`;
    },
  };
}
