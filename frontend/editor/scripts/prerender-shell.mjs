/** Puts the landing screen's first paint into index.html. */
import { createServer } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHELL_START = "<!--shell:start-->";
const SHELL_END = "<!--shell:end-->";
const SHELL_LANGUAGE = "en-US";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

/** The served copy of index.html without any shell a previous build emitted. */
function stripShell(html) {
  let cleaned = html;
  const start = cleaned.indexOf(SHELL_START);
  const end = cleaned.indexOf(SHELL_END);
  if (start !== -1 && end !== -1 && end >= start) {
    cleaned =
      cleaned.slice(0, start) +
      '<div id="root"></div>' +
      cleaned.slice(end + SHELL_END.length);
  }
  const appEntryMatch =
    /<script id="app-entry" type="application\/json">([\s\S]*?)<\/script>\s*<script>\(function\(\)\{var booted=false;[\s\S]*?<\/script>/.exec(
      cleaned,
    );
  if (appEntryMatch) {
    try {
      const data = JSON.parse(appEntryMatch[1]);
      if (data.src) {
        let restored = `<script type="module" crossorigin src="${data.src}"></script>`;
        if (Array.isArray(data.hints)) {
          restored += data.hints
            .map((h) => `<link rel="modulepreload" crossorigin href="${h}">`)
            .join("");
        }
        if (Array.isArray(data.meta)) {
          restored += data.meta
            .map((m) => `<link rel="${m.rel}" href="${m.href}">`)
            .join("");
        }
        cleaned = cleaned.replace(appEntryMatch[0], restored);
        cleaned = cleaned.replace(
          /<link rel="stylesheet" data-href="([^"]+)" disabled>/g,
          '<link rel="stylesheet" crossorigin href="$1">',
        );
      }
    } catch {
      // Unparseable payload leaves index.html unmodified.
    }
  }
  return cleaned;
}

function startStaticServer(root) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let filePath = resolve(
      root,
      normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, ""),
    );
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(filePath)).isDirectory())
        filePath = join(filePath, "index.html");
    } catch {
      filePath = join(root, "index.html");
    }
    try {
      let body = await readFile(filePath);
      if (filePath.endsWith("index.html"))
        body = Buffer.from(stripShell(body.toString("utf8")));
      response.writeHead(200, {
        "content-type":
          CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((ready) => {
    server.listen(0, "127.0.0.1", () => {
      server.unref();
      const { port } = server.address();
      ready({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/** The stub module only imports Playwright types, so esbuild can strip types and load it directly in Node. */
async function loadStubHelper(editorDir) {
  const source = await readFile(
    join(editorDir, "src/core/tests/helpers/api-stubs.ts"),
    "utf8",
  );
  const { transform } = await import("esbuild");
  const { code } = await transform(source, {
    loader: "ts",
    format: "esm",
    target: "node22",
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(dataUrl);
}

/** Installed on every navigation so capture, per-language passes, and the client script share one text walk. */
function installShellHelpers() {
  const accepts = (node) => {
    const parent = node.parentElement;
    if (!parent) return false;
    if (parent.tagName === "SCRIPT" || parent.tagName === "STYLE") return false;
    return Boolean(node.nodeValue && node.nodeValue.trim());
  };
  const walk = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode())
      if (accepts(walker.currentNode)) nodes.push(walker.currentNode);
    return nodes;
  };
  globalThis.__shellTexts = () =>
    walk(document.getElementById("root")).map((node) => node.nodeValue);
  globalThis.__shellCount = () => walk(document.getElementById("root")).length;
  // The whole of #root, not only the frame: the client hydrates this markup, so it has
  // to be exactly what React's first render produces, frame included.
  globalThis.__shellCritical = () => {
    const root = document.getElementById("root");
    if (!root) return "";
    const elements = [
      document.documentElement,
      document.body,
      root,
      ...root.querySelectorAll("*"),
    ];
    const seen = new Set();
    const once = (text) => {
      if (!text || seen.has(text)) return "";
      seen.add(text);
      return text;
    };
    const applies = (selector) => {
      for (const part of selector.split(",")) {
        const raw = part.trim();
        if (!raw) return true;
        const test = raw
          .replace(/::[\w-]+(?:\([^)]*\))?/g, "")
          .replace(
            /\[data-(?:mantine-color-scheme|theme|app-theme|accent)[^\]]*\]/g,
            "",
          )
          .trim();
        if (!test) return true;
        try {
          if (elements.some((element) => element.matches(test))) return true;
        } catch {
          return true;
        }
      }
      return false;
    };
    const walk = (rules) => {
      let kept = "";
      for (const rule of rules) {
        if (rule.cssRules && rule.cssRules.length) {
          const inner = walk(rule.cssRules);
          if (inner)
            kept += once(
              rule.cssText.slice(0, rule.cssText.indexOf("{")) +
                "{" +
                inner +
                "}",
            );
        } else if (rule.selectorText) {
          if (applies(rule.selectorText)) kept += once(rule.cssText);
        } else {
          kept += once(rule.cssText);
        }
      }
      return kept;
    };
    let out = "";
    for (const sheet of document.styleSheets) {
      try {
        out += walk(sheet.cssRules);
      } catch {
        // A sheet the page cannot read cannot be inlined.
      }
    }
    // Strip inline style/script tags from the clone so Mantine's full variable dump does not block pruning.
    const cleanRoot = root.cloneNode(true);
    cleanRoot.querySelectorAll("script, style").forEach((el) => el.remove());
    const markup = cleanRoot.outerHTML;
    for (let pass = 0; pass < 4; pass++) {
      const names = new Set();
      for (const match of (out + markup).matchAll(/var\(\s*--([\w-]+)/g)) {
        names.add(match[1]);
      }
      const before = out;
      out = out.replace(/--([\w-]+)\s*:[^;}]*;?/g, (declaration, name) =>
        names.has(name) ? declaration : "",
      );
      if (out === before) break;
    }
    return out;
  };

  /** Swaps the shell's svg images for data URIs, so its paint fetches no artwork. */
  globalThis.__shellInlineImages = async () => {
    const root = document.getElementById("root");
    if (!root) return 0;
    let count = 0;
    for (const image of root.querySelectorAll("img[src$='.svg']")) {
      const source = image.getAttribute("src");
      if (!source || source.startsWith("data:")) continue;
      try {
        const text = await (await fetch(source)).text();
        const utf8 = `data:image/svg+xml;utf8,${encodeURIComponent(text)}`;
        const base64 = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
        image.setAttribute("src", utf8.length <= base64.length ? utf8 : base64);
        count += 1;
      } catch {
        // An image the capture cannot read stays a request; the shell still paints.
      }
    }
    return count;
  };

  globalThis.__shellMarkup = () => {
    const root = document.getElementById("root");
    if (!root?.querySelector(".app-frame")) return null;
    // Strip inline <style>/<script> tags that were already extracted into #shell-critical or clobber dark mode.
    const clean = root.cloneNode(true);
    clean.querySelectorAll("script, style").forEach((el) => el.remove());
    return clean.innerHTML;
  };
  /** Resolves once the rendered text stops changing, so the capture is complete. */
  globalThis.__shellSettled = (boundMs) =>
    new Promise((settled) => {
      let previous = null;
      let stable = 0;
      const bound = setTimeout(settled, boundMs);
      const tick = () => {
        const now = globalThis.__shellTexts().join("\u0000");
        if (now === previous) {
          if (++stable >= 3) {
            clearTimeout(bound);
            settled();
            return;
          }
        } else {
          stable = 0;
        }
        previous = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  /** The app frame is chrome, and it renders before the lazy landing route and the startup dictionary arrive. */
  globalThis.__shellReady = (quietSamples, intervalMs, boundMs) =>
    new Promise((ready) => {
      let previous = -1;
      let stable = 0;
      const bound = setTimeout(ready, boundMs);
      const tick = () => {
        const count = globalThis.__shellCount();
        if (
          globalThis.i18next?.isInitialized &&
          count > 10 &&
          count === previous
        ) {
          if (++stable >= quietSamples) {
            clearTimeout(bound);
            ready();
            return;
          }
        } else {
          stable = 0;
        }
        previous = count;
        setTimeout(tick, intervalMs);
      };
      tick();
    });
}

async function deliveredLanguages(distDir) {
  const entries = await readdir(join(distDir, "locales"), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function captureShellPage({
  browser,
  serverOrigin,
  mockAppApis,
  viewport,
  distDir,
  editorDir,
}) {
  const context = await browser.newContext({ viewport });
  try {
    await context.addInitScript(`(${installShellHelpers.toString()})();`);
    await context.addInitScript((language) => {
      try {
        localStorage.setItem("i18nextLng", language);
      } catch {
        /* storage unavailable: the app detects from the browser instead */
      }
    }, SHELL_LANGUAGE);
    const page = await context.newPage();
    await mockAppApis(page);
    await page.goto(`${serverOrigin}/`, { waitUntil: "load" });
    await page.waitForSelector("#root .app-frame", { timeout: 60_000 });
    await page.waitForSelector("#root .landing-actions-enter", {
      timeout: 60_000,
    });
    await page.evaluate(() => globalThis.__shellReady(3, 100, 30_000));
    await page.evaluate(() => globalThis.__shellInlineImages());

    const critical = await page.evaluate(() => globalThis.__shellCritical());
    const captured = await page.evaluate(() => globalThis.__shellMarkup());
    if (!captured) throw new Error("the landing screen rendered no app frame");
    const markup = captured.split(`${serverOrigin}/`).join("");
    const nodes = await page.evaluate(() => globalThis.__shellCount());

    const languages = await deliveredLanguages(distDir);
    const { strings, dropped } = await page.evaluate(
      async ({ langs, expectedNodes }) => {
        const results = {};
        const unrendered = [];
        for (const language of langs) {
          await globalThis.i18next.changeLanguage(language);
          await globalThis.__shellSettled(10_000);
          const texts = globalThis.__shellTexts();
          if (texts.length === expectedNodes) results[language] = texts;
          else unrendered.push(`${language} (${texts.length})`);
        }
        return { strings: results, dropped: unrendered };
      },
      { langs: languages, expectedNodes: nodes },
    );
    const rtl = (
      await readFile(join(editorDir, "src/core/i18n/languages.ts"), "utf8")
    ).match(/rtlLanguages\s*=\s*\[([^\]]*)\]/);
    return {
      markup,
      nodes,
      critical,
      strings,
      dropped,
      rtl: rtl
        ? [...rtl[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
        : [],
      base: SHELL_LANGUAGE,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

function resolveChromiumExecutablePath(chromium) {
  const customPath = process.env.PRERENDER_CHROMIUM_PATH;
  if (customPath) {
    if (existsSync(customPath)) return customPath;
    throw new Error(
      `Chromium binary not found at PRERENDER_CHROMIUM_PATH=${customPath}`,
    );
  }

  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && existsSync(defaultPath)) return defaultPath;
  } catch {
    // Falls through to scanning cached browser installations
  }

  const searchDirs = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), ".cache", "ms-playwright"),
    "/root/.cache/ms-playwright",
  ].filter(Boolean);

  for (const cacheDir of searchDirs) {
    if (!existsSync(cacheDir)) continue;
    try {
      const entries = readdirSync(cacheDir);
      const chromiumDirs = entries
        .filter((d) => d.startsWith("chromium-"))
        .sort()
        .reverse();

      for (const cDir of chromiumDirs) {
        const fullDir = join(cacheDir, cDir);
        const candidates = [
          join(fullDir, "chrome-linux", "chrome"),
          join(fullDir, "chrome-linux64", "chrome"),
          join(fullDir, "chrome-linux-arm64", "chrome"),
          join(
            fullDir,
            "chrome-mac",
            "Chromium.app",
            "Contents",
            "MacOS",
            "Chromium",
          ),
          join(
            fullDir,
            "chrome-mac-arm64",
            "Chromium.app",
            "Contents",
            "MacOS",
            "Chromium",
          ),
          join(fullDir, "chrome-win", "chrome.exe"),
        ];
        for (const candidate of candidates) {
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch {
      // Continue searching next directory
    }
  }

  throw new Error(
    "Playwright Chromium browser is not installed in standard cache locations",
  );
}

export async function captureShell({
  distDir,
  editorDir,
  viewport = { width: 1350, height: 940 },
  browser: providedBrowser = null,
  server: providedServer = null,
}) {
  const { chromium } = await import("@playwright/test");
  const execPath = providedBrowser
    ? undefined
    : resolveChromiumExecutablePath(chromium);

  const { mockAppApis } = await loadStubHelper(editorDir);
  let server = providedServer;
  let browser = providedBrowser;
  const ownsServer = !server;
  const ownsBrowser = !browser;
  try {
    if (!server) server = await startStaticServer(distDir);
    if (!browser) {
      browser = await chromium.launch({
        executablePath: execPath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }
    return await captureShellPage({
      browser,
      serverOrigin: server.origin,
      mockAppApis,
      viewport,
      distDir,
      editorDir,
    });
  } finally {
    if (ownsBrowser && browser) await browser.close().catch(() => {});
    if (ownsServer && server) await server.close().catch(() => {});
  }
}

/** Deduplicates top-level rules across wide and narrow critical CSS and drops empty blocks and unused keyframes. */
function mergeCriticalCss(wideCss, narrowCss, combinedMarkup) {
  const splitRules = (css) => {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) {
          const rule = css.slice(start, i + 1).trim();
          if (rule) out.push(rule);
          start = i + 1;
        }
      }
    }
    return out;
  };
  let merged = [...new Set(splitRules(`${wideCss}\n${narrowCss}`))].join("\n");
  for (let pass = 0; pass < 4; pass++) {
    const names = new Set();
    for (const m of (merged + combinedMarkup).matchAll(/var\(\s*--([\w-]+)/g)) {
      names.add(m[1]);
    }
    const before = merged;
    merged = merged.replace(/--([\w-]+)\s*:[^;{}]*;?/g, (decl, name) =>
      names.has(name) ? decl : "",
    );
    if (merged === before) break;
  }
  const nonEmpty = splitRules(merged).filter((rule) => {
    const inner = rule
      .slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"))
      .trim();
    if (!inner || /^:root\s*\{\s*\}$/.test(inner)) return false;
    return true;
  });
  const usedKeyframes = new Set();
  for (const rule of nonEmpty) {
    if (!rule.startsWith("@keyframes")) {
      for (const m of rule.matchAll(/animation(?:-name)?\s*:[^;}]+/g)) {
        for (const token of m[0].split(/[\s,:()]+/)) usedKeyframes.add(token);
      }
    }
  }
  const usedProperties = new Set();
  for (const m of (merged + combinedMarkup).matchAll(/var\(\s*--([\w-]+)/g)) {
    usedProperties.add(m[1]);
  }
  return nonEmpty
    .filter((rule) => {
      if (rule.startsWith("@property")) {
        const name = /^@property\s+--([\w-]+)/.exec(rule)?.[1];
        return !name || usedProperties.has(name);
      }
      if (!rule.startsWith("@keyframes")) return true;
      const name = /^@keyframes\s+([^\s{]+)/.exec(rule)?.[1];
      return !name || usedKeyframes.has(name);
    })
    .join("");
}

/** The resolver has to run before paint and must never leave wrong words up. */
function shellScript({ wide, narrow }) {
  const langs = Object.keys(wide.strings);
  const payload = JSON.stringify({
    base: wide.base,
    rtl: wide.rtl,
    nodes: { wide: wide.nodes, narrow: narrow?.nodes ?? 0 },
    langs,
    // Base language strings are already in the DOM markup; non-base packs live in `dist/shells/<lang>.json`.
    strings: {},
  }).replace(/</g, "\\u003c");
  return [
    `<script id="shell-strings" type="application/json">${payload}</script>`,
    `<script>(function(){var root=document.getElementById("root");if(!root)return;` +
      `function clearShells(){var s=root.querySelectorAll("[data-shell-for]");for(var i=0;i<s.length;i++)s[i].remove();}` +
      `var bPath=new URL(".",document.baseURI).pathname.replace(/\\/+$/,"");` +
      `var cPath=location.pathname.replace(/\\/index\\.html$/,"").replace(/\\/+$/,"");` +
      `if(cPath!==bPath||document.documentElement.hasAttribute("data-shell-hidden")){clearShells();root.removeAttribute("data-shell");document.documentElement.setAttribute("data-shell-hidden","");return;}`,
    `function drop(){if(!root.hasAttribute("data-shell"))return;clearShells();root.removeAttribute("data-shell");if(window.__spdfBoot)window.__spdfBoot();}`,
    `try{var data=JSON.parse(document.getElementById("shell-strings").textContent);`,
    `var stored=null;try{stored=localStorage.getItem("i18nextLng");}catch(e){}`,
    // A tag arrives in any case and with either separator, so match it exactly, then
    // case-insensitively, then by language, and fall back to the captured base.
    `function pick(name){if(!name)return null;name=String(name).replace(/_/g,"-");`,
    `var keys=data.langs;var lower=name.toLowerCase();if(keys.indexOf(name)!==-1)return name;`,
    `for(var i=0;i<keys.length;i++)if(keys[i].toLowerCase()===lower)return keys[i];`,
    `var primary=lower.split("-")[0];for(var j=0;j<keys.length;j++){var k=keys[j].toLowerCase();`,
    `if(k===primary||k.split("-")[0]===primary)return keys[j];}return null;}`,
    `var language=pick(stored)||pick(navigator.language)||pick(data.base);`,
    `if(!language){drop();return;}`,
    `function apply(shell){if(!root.hasAttribute("data-shell"))return;try{` +
      `if(shell&&shell.both){shell={wide:shell.both,narrow:shell.both};}`,
    `var shells=root.querySelectorAll("[data-shell-for]");if(!shells.length)return;`,
    // Both shells are in the document and the stylesheet picks one, so the first
    // layout is already the final one; only the words have to change here.
    `var active=matchMedia("(max-width: 1024px)").matches?"narrow":"wide";`,
    `if(shell&&!shell[active]){drop();return;}`,
    // Two copies of an id confuse a label or a search box that looks one up, so the
    // shell the viewport does not draw gives its ids up.
    `for(var s=0;s<shells.length;s++)if(shells[s].getAttribute("data-shell-for")!==active){`,
    `var staled=shells[s].querySelectorAll("[id],[data-testid]");for(var t=0;t<staled.length;t++){staled[t].removeAttribute("id");staled[t].removeAttribute("data-testid");}}`,
    `if(shell){for(var i=0;i<shells.length;i++){var name=shells[i].getAttribute("data-shell-for");`,
    `var list=shell[name];if(!list)continue;`,
    `if(list.length!==data.nodes[name]){drop();return;}`,
    `var walker=document.createTreeWalker(shells[i],NodeFilter.SHOW_TEXT);var texts=[];`,
    `while(walker.nextNode()){var node=walker.currentNode;var parent=node.parentElement;`,
    `if(!parent||parent.tagName==="SCRIPT"||parent.tagName==="STYLE")continue;`,
    `if(!node.nodeValue||!node.nodeValue.trim())continue;texts.push(node);}`,
    `if(texts.length!==list.length){drop();return;}`,
    `for(var j=0;j<texts.length;j++)texts[j].nodeValue=list[j];}}`,
    // React builds these through `new URL(..., import.meta.url)`, which is absolute;
    // the capture stores them base-relative so the markup follows the deployment base.
    `var images=root.querySelectorAll("img[src]");`,
    `for(var k=0;k<images.length;k++){var src=images[k].getAttribute("src");`,
    `if(src&&src.indexOf("://")<0&&src.indexOf("data:")!==0&&src.charAt(0)!=="/"){images[k].setAttribute("src",new URL(src,document.baseURI).href);}}`,
    `if(data.rtl.indexOf(language)!==-1)document.documentElement.dir="rtl";`,
    `document.documentElement.lang=language;`,
    `root.removeAttribute("data-shell");`,
    `}catch(e){drop();}}`,
    // The base language is already in the DOM; every other language fetches its pack first.
    `if(language===data.base){apply(null);}else{`,
    `fetch(new URL("shells/"+encodeURIComponent(language)+".json",document.baseURI))`,
    `.then(function(response){return response.ok?response.json():null;})`,
    `.then(function(shell){if(shell)apply(shell);else drop();},function(){drop();});}`,
    `}catch(e){drop();}})();</script>`,
  ].join("");
}

/** The entry module tag Vite emits: an inline module script that boots the app. */
const ENTRY_TAG =
  /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/;

/** Holds the module entry until the first gesture, deep link, or file selection so the shell paints first. */
function deferEntry(html) {
  const entry = ENTRY_TAG.exec(html);
  if (!entry) throw new Error("index.html has no module entry script");
  const hints = [
    ...html.matchAll(
      /<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"[^>]*>/g,
    ),
  ]
    .map((match) => match[1])
    .filter((href) => href !== entry[1]);
  // The tab icon and the manifest are fetched after the first paint, not before it.
  const meta = [
    ...html.matchAll(
      /<link\b[^>]*\brel="(icon|apple-touch-icon|manifest)"[^>]*\bhref="([^"]+)"[^>]*>/g,
    ),
  ].map((match) => ({ rel: match[1], href: match[2] }));
  const payload = JSON.stringify({ src: entry[1], hints, meta }).replace(
    /</g,
    "\\u003c",
  );
  // The shell carries its own rules; the app's sheets and hints arrive with the app.
  const held = (page) =>
    page
      .replace(/<link\b[^>]*\brel="preload"[^>]*\bas="style"[^>]*>/g, "")
      .replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, "")
      .replace(
        /<link\b[^>]*\brel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g,
        "",
      )
      .replace(
        /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g,
        (_match, href) =>
          `<link rel="stylesheet" data-href="${href}" disabled>`,
      );
  return held(html).replace(
    ENTRY_TAG,
    `<script id="app-entry" type="application/json">${payload}</script>` +
      "<script>(function(){var booted=false;" +
      'var entry=document.getElementById("app-entry");if(!entry)return;' +
      "var payload=JSON.parse(entry.textContent);var src=payload.src;" +
      // Hints and sheets arrive with the app rather than before its first paint.
      "function restore(){var hints=payload.hints||[];" +
      'for(var h=0;h<hints.length;h++){var hint=document.createElement("link");hint.rel="modulepreload";' +
      'hint.crossOrigin="anonymous";hint.href=hints[h];document.head.appendChild(hint);}' +
      'var lng=document.documentElement.lang||"en-US";var targetLng=lng==="en"?"en-US":lng;' +
      'var pLngs=targetLng==="en-US"?["en-US"]:[targetLng,"en-US"];' +
      'for(var p=0;p<pLngs.length;p++){var lp=document.createElement("link");lp.rel="preload";lp.as="fetch";lp.crossOrigin="anonymous";' +
      'lp.href=new URL("locales/"+pLngs[p]+"/translation.toml",document.baseURI).href;document.head.appendChild(lp);}' +
      'var meta=payload.meta||[];for(var m=0;m<meta.length;m++){var icon=document.createElement("link");' +
      "icon.rel=meta[m].rel;icon.href=meta[m].href;document.head.appendChild(icon);}" +
      'var links=document.querySelectorAll("link[data-href]");' +
      'for(var k=0;k<links.length;k++){var l=links[k];l.href=l.getAttribute("data-href");l.removeAttribute("data-href");l.disabled=false;}}' +
      "var activeInputId=null;var activeInputValue=null;var activeSelection=null;var restoreTries=0;" +
      'addEventListener("focusin",function(e){var t=e.target;' +
      'if(t&&t.tagName==="INPUT"&&t.id&&t.closest&&t.closest("[data-shell-for]")){activeInputId=t.id;activeInputValue=t.value||"";try{activeSelection=[t.selectionStart,t.selectionEnd];}catch(err){}' +
      "window.__spdfInputHandoff={id:activeInputId,value:activeInputValue,selection:activeSelection};}" +
      "},true);" +
      'addEventListener("input",function(e){var t=e.target;' +
      'if(t&&t.tagName==="INPUT"&&t.id&&t.closest&&t.closest("[data-shell-for]")&&"value" in t){activeInputId=t.id;activeInputValue=t.value||"";try{activeSelection=[t.selectionStart,t.selectionEnd];}catch(err){}' +
      "window.__spdfInputHandoff={id:activeInputId,value:activeInputValue,selection:activeSelection};}" +
      "},true);" +
      "function restoreInput(){" +
      'if(!activeInputId){if(document.querySelector("[data-shell-for]")&&restoreTries++<200)setTimeout(restoreInput,50);return;}' +
      "var el=document.getElementById(activeInputId);" +
      'if(el&&!el.closest("[data-shell-for]")){' +
      'if(activeInputValue!=null){var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");' +
      "if(d&&d.set)d.set.call(el,activeInputValue);else el.value=activeInputValue;" +
      'if(el._valueTracker)try{el._valueTracker.setValue("");}catch(err){}' +
      'el.dispatchEvent(new Event("input",{bubbles:true}));' +
      'el.dispatchEvent(new Event("change",{bubbles:true}));}' +
      "if(activeSelection){try{el.setSelectionRange(activeSelection[0],activeSelection[1]);}catch(err){}}" +
      "el.focus();activeInputId=null;return;}" +
      "if(restoreTries++<200)setTimeout(restoreInput,50);}" +
      "function boot(){if(booted)return;booted=true;restore();" +
      'var script=document.createElement("script");script.type="module";script.crossOrigin="anonymous";script.src=src;' +
      "script.onerror=function(){booted=false;};" +
      "document.head.appendChild(script);" +
      "restoreInput();}" +
      "window.__spdfBoot=boot;" +
      // A deep link is an app page from its first frame: boot at once, keep the
      // landing shell hidden until React paints over it.
      'var basePath=new URL(src,document.baseURI).pathname.replace(/\\/assets\\/[^/]+$/,"").replace(/\\/+$/,"");' +
      'var curPath=location.pathname.replace(/\\/index\\.html$/,"").replace(/\\/+$/,"");' +
      "if(curPath!==basePath){" +
      'document.documentElement.setAttribute("data-shell-hidden","");' +
      'var r=document.getElementById("root");if(r){var s=r.querySelectorAll("[data-shell-for]");for(var i=0;i<s.length;i++)s[i].remove();r.removeAttribute("data-shell");}' +
      "boot();return;}" +
      // The shell is the first screen, so the app waits for a gesture or idle window.
      'var triggers=["pointerdown","keydown","touchstart","wheel","focusin","dragenter","paste"];' +
      "for(var i=0;i<triggers.length;i++)addEventListener(triggers[i],boot,{once:true,passive:true});" +
      'setTimeout(function(){if("requestIdleCallback" in window){requestIdleCallback(boot,{timeout:1000});}else{boot();}},3000);' +
      'addEventListener("dragenter",function(e){if(document.querySelector("[data-shell-for]"))e.preventDefault();},true);' +
      'addEventListener("dragover",function(e){if(document.querySelector("[data-shell-for]")){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect="copy";}},true);' +
      'addEventListener("drop",function(e){if(!document.querySelector("[data-shell-for]"))return;e.preventDefault();var f=e.dataTransfer&&e.dataTransfer.files;if(f&&f.length){pending=f;boot();handOff();}},true);' +
      "var pendingButtonSelector=null;" +
      'addEventListener("click",function(event){if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;' +
      'var t=event.target;if(!t||!t.closest||!t.closest("[data-shell-for]"))return;' +
      'var btn=t.closest("button[data-testid=\\"files-button\\"],button[data-testid=\\"pdf-library-add-files\\"],button.sui-btn--primary");' +
      'if(btn){var sh=btn.closest("[data-shell-for]");var fi=sh&&sh.querySelector("input[type=file]");if(fi)fi.click();boot();return;}' +
      'var link=t.closest("a[href]");' +
      'if(link&&!link.target&&!link.hasAttribute("download")){var href=link.getAttribute("href");' +
      'if(href&&href.charAt(0)!=="#"&&!/^[a-z]+:/i.test(href)){' +
      'event.preventDefault();try{history.pushState({},"",href);dispatchEvent(new PopStateEvent("popstate"));}catch(e){location.href=href;}' +
      "boot();" +
      'var waited=0;(function route(){if(document.querySelector("[data-shell-for]")&&waited++<200){setTimeout(route,50);return;}' +
      'try{if(location.pathname!==new URL(href,document.baseURI).pathname){history.pushState({},"",href);dispatchEvent(new PopStateEvent("popstate"));}}catch(e){}})();return;}}' +
      'var genericBtn=t.closest("button");' +
      "if(genericBtn){" +
      'var testId=genericBtn.getAttribute("data-testid");var aria=genericBtn.getAttribute("aria-label");' +
      'if(testId)pendingButtonSelector="button[data-testid=\\""+testId+"\\"]";' +
      'else if(aria)pendingButtonSelector="button[aria-label=\\""+aria+"\\"]";' +
      'else if(genericBtn.className)pendingButtonSelector="button."+genericBtn.className.split(" ").filter(Boolean).join(".");' +
      "boot();handOff();return;}" +
      "},true);" +
      "var pending=null;var tries=0;" +
      "function onChange(event){var target=event.target;" +
      'if(!target||target.tagName!=="INPUT"||target.type!=="file"||!target.closest||!target.closest("[data-shell-for]")||!target.files||!target.files.length)return;' +
      'removeEventListener("change",onChange,true);pending=target.files;boot();handOff();}' +
      'addEventListener("change",onChange,true);' +
      "function handOff(){" +
      'if(document.querySelector("[data-shell-for]")&&tries++<200){setTimeout(handOff,50);return;}' +
      "if(pendingButtonSelector){var b=document.querySelector(pendingButtonSelector);if(b){b.click();pendingButtonSelector=null;}}" +
      "if(!pending)return;" +
      'var input=document.querySelector("input[type=file]");' +
      "if(!input){if(tries++<200){setTimeout(handOff,50);return;}pending=null;return;}" +
      "var files=pending;pending=null;" +
      "try{var carrier=new DataTransfer();for(var j=0;j<files.length;j++)carrier.items.add(files[j]);" +
      'input.files=carrier.files;input.dispatchEvent(new Event("change",{bubbles:true}));}catch(e){}}' +
      "})();</script>",
  );
}

/** Swaps the page's #root element for the shell markup. */
function replaceRoot(html, markup) {
  const open = html.indexOf('<div id="root"');
  if (open === -1) throw new Error('index.html has no <div id="root"></div>');
  const tag = /<\/?div\b/g;
  tag.lastIndex = open;
  let depth = 0;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    depth += match[0] === "</div" ? -1 : 1;
    if (depth === 0) {
      return (
        html.slice(0, open) +
        markup +
        html.slice(match.index + match[0].length + 1)
      );
    }
  }
  throw new Error('index.html has no <div id="root"></div>');
}

export async function prerenderShell({
  distDir,
  editorDir = resolve(distDir, ".."),
}) {
  const { chromium } = await import("@playwright/test");
  const execPath = resolveChromiumExecutablePath(chromium);

  const { mockAppApis } = await loadStubHelper(editorDir);
  let server = null;
  let browser = null;
  let wide = null;
  let narrow = null;

  try {
    server = await startStaticServer(distDir);
    browser = await chromium.launch({
      executablePath: execPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    [wide, narrow] = await Promise.all([
      captureShellPage({
        browser,
        serverOrigin: server.origin,
        mockAppApis,
        viewport: { width: 1350, height: 940 },
        distDir,
        editorDir,
      }),
      captureShellPage({
        browser,
        serverOrigin: server.origin,
        mockAppApis,
        viewport: { width: 412, height: 823 },
        distDir,
        editorDir,
      }),
    ]);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
  const indexPath = join(distDir, "index.html");
  const html = stripShell(await readFile(indexPath, "utf8"));
  const languageCount = Object.keys(wide.strings).length;
  if (languageCount === 0) {
    throw new Error(
      `no language reproduced the captured text nodes (base ${wide.nodes} nodes; ` +
        `saw ${wide.dropped.slice(0, 5).join(", ") || "nothing"})`,
    );
  }
  const criticalCss = mergeCriticalCss(
    wide.critical,
    narrow ? narrow.critical : "",
    `${wide.markup}\n${narrow ? narrow.markup : ""}`,
  );
  const emitted = [
    SHELL_START,
    // Ship both shells inline and let the media query pick one so the first layout matches the viewport.
    `<style>#root[data-shell="pending"]{visibility:hidden}[data-shell-hidden] #root[data-shell="pending"]{visibility:hidden!important}[data-shell-hidden] [data-shell-for]{display:none!important}[data-shell-for="narrow"]{display:none}@media (max-width: 1024px){[data-shell-for="wide"]{display:none}[data-shell-for="narrow"]{display:block}}</style>`,
    `<noscript><style>#root[data-shell="pending"]{visibility:visible!important}</style></noscript>`,
    `<style id="shell-critical">${criticalCss}</style>`,
    `<div id="root" data-shell="pending"><div data-shell-for="wide">${wide.markup}</div>`,
    narrow ? `<div data-shell-for="narrow">${narrow.markup}</div>` : "",
    `</div>`,
    shellScript({ wide, narrow }),
    SHELL_END,
  ].join("");
  const withShell = replaceRoot(html, emitted);
  await writeFile(indexPath, deferEntry(withShell));
  const shellsDir = join(distDir, "shells");
  await mkdir(shellsDir, { recursive: true });
  for (const language of Object.keys(wide.strings)) {
    if (language === wide.base) continue;
    const wideStrings = wide.strings[language];
    const narrowStrings = narrow?.strings[language];
    const pack = !narrowStrings
      ? { wide: wideStrings }
      : JSON.stringify(narrowStrings) === JSON.stringify(wideStrings)
        ? { both: wideStrings }
        : { wide: wideStrings, narrow: narrowStrings };
    await writeFile(join(shellsDir, `${language}.json`), JSON.stringify(pack));
  }
  return {
    nodes: wide.nodes,
    languages: languageCount,
    dropped: wide.dropped,
    bytes: Buffer.byteLength(emitted),
    narrowNodes: narrow?.nodes ?? 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const distDir = resolve(import.meta.dirname, "../dist");
  prerenderShell({ distDir })
    .then((result) =>
      console.log(
        `[prerender-shell] ${result.languages} languages, ${result.nodes} text nodes, ` +
          `${(result.bytes / 1024).toFixed(1)} KiB${result.narrowNodes ? `, phone shell ${result.narrowNodes} text nodes` : ""}${result.dropped.length ? `, no shell for ${result.dropped.join(", ")}` : ""}`,
      ),
    )
    .catch((error) => {
      console.error(
        `[prerender-shell] ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    });
}
