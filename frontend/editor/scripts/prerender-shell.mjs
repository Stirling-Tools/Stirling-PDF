/** Puts the landing screen's first paint into index.html. */
import { createServer } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHELL_START = "<!--shell:start-->";
const SHELL_END = "<!--shell:end-->";
const SHELL_STATE_START = "<!--shell-state:start-->";
const SHELL_STATE_END = "<!--shell-state:end-->";
const SHELL_LANGUAGE = "en-US";

/**
 * Runs at the top of <body> and records the decision the shell CSS and the
 * deferred entry both need, so neither has to re-derive auth or route state.
 * It sits after the head's server flag but before the shell markup and CSS.
 *
 * An unknown login setting counts as an auth deploy in web builds: the
 * frontend-only image has no backend to inject the flag. The Spring controller
 * always injects it, including `false`, so anonymous mode still paints the app
 * immediately. Core and desktop builds pass `defaultLogin: false` because they
 * never route to /login.
 */
function shellStateScript(defaultLogin) {
  const fallbackLogin = defaultLogin ? "true" : "false";
  return `<script>(function(){var r=document.documentElement;
function trim(p){while(p.length&&p.charAt(p.length-1)==="/")p=p.slice(0,-1);return p;}
var b=trim(new URL(".",document.baseURI).pathname);
var c=location.pathname;
if(c.length>=11&&c.slice(-11)==="/index.html")c=c.slice(0,-11);
c=trim(c);
function hasSession(){try{var t=localStorage.getItem("stirling_jwt");
if(t){var parts=t.split(".");if(parts.length<3)return true;
var p=parts[1].replace(/-/g,"+").replace(/_/g,"/");
while(p.length%4)p+="=";
try{var claims=JSON.parse(atob(p));
if(!claims||typeof claims.exp!=="number"||claims.exp*1000>Date.now())return true;}catch(e){return true;}}
for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
if(k&&k.indexOf("sb-")===0&&k.indexOf("-auth-token")>0)return true;}
}catch(e){return true;}return false;}
var flag=window.STIRLING_PDF_ENABLE_LOGIN;
var stored=null;try{stored=localStorage.getItem("stirling_login_enabled");}catch(e){}
var hasAuth=hasSession();
var isLoginRoute=c===b+"/login"||c===b+"/signup";
var isEditorRoute=c===b||c===b+"/editor";
var reqLogin=flag===true||(flag!==false&&stored==="true");
var loginUnknown=flag===undefined&&stored!=="true"&&stored!=="false";
// Core and desktop never show /login; only web builds default to it.
var fallbackLogin=${fallbackLogin};
var loginPossible=flag===true||(flag!==false&&(fallbackLogin||stored==="true"));
var showLogin=!hasAuth&&((isLoginRoute&&loginPossible)||(isEditorRoute&&(reqLogin||(loginUnknown&&fallbackLogin))));
var route=isLoginRoute?"login":isEditorRoute?"editor":"deep";
r.setAttribute("data-shell-route",route);
// A deep link is an app page from its first frame: hide the shell before its
// markup is parsed, not after the whole document has loaded.
if(route==="deep")r.setAttribute("data-shell-hidden","");
r.setAttribute("data-shell-auth",hasAuth?"1":"0");
r.setAttribute("data-shell-login",showLogin?"1":"0");
if(showLogin)r.setAttribute("data-shell-mode","login");
})();</script>`;
}

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
  const stateStart = cleaned.indexOf(SHELL_STATE_START);
  const stateEnd = cleaned.indexOf(SHELL_STATE_END);
  if (stateStart !== -1 && stateEnd >= stateStart) {
    cleaned =
      cleaned.slice(0, stateStart) +
      cleaned.slice(stateEnd + SHELL_STATE_END.length);
  }
  const start = cleaned.indexOf(SHELL_START);
  const end = cleaned.indexOf(SHELL_END);
  if (start !== -1 && end !== -1 && end >= start) {
    cleaned =
      cleaned.slice(0, start) +
      '<div id="root"></div>' +
      cleaned.slice(end + SHELL_END.length);
  }
  // The boot IIFE lives at the end of <body>, not next to the payload.
  cleaned = cleaned.replace(
    /<script>\(function\(\)\{var booted=false;[\s\S]*?<\/script>/,
    "",
  );
  cleaned = cleaned.replace(/<html\b[^>]*>/i, (tag) =>
    tag.replace(
      /\sdata-shell-(?:hidden|mode|route|auth|login)(?:="[^"]*")?/g,
      "",
    ),
  );
  const appEntryMatch =
    /<script id="app-entry" type="application\/json">([\s\S]*?)<\/script>/.exec(
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
        if (Array.isArray(data.styleHints)) {
          restored += data.styleHints
            .map(
              (h) => `<link rel="preload" as="style" crossorigin href="${h}">`,
            )
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
      if (filePath.endsWith(".html"))
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

  globalThis.__shellMarkup = (selector = ".app-frame") => {
    const root = document.getElementById("root");
    if (selector && !root?.querySelector(selector)) return null;
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
  globalThis.__shellReady = (
    quietSamples,
    intervalMs,
    boundMs,
    minCount = 10,
  ) =>
    new Promise((ready) => {
      let previous = -1;
      let stable = 0;
      const bound = setTimeout(ready, boundMs);
      const tick = () => {
        const count = globalThis.__shellCount();
        if (
          globalThis.i18next?.isInitialized &&
          count >= minCount &&
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
  routePath = "/",
  readySelectors = ["#root .app-frame", "#root .landing-actions-enter"],
  markupSelector = ".app-frame",
  minReadyCount = 10,
  mockOpts = {},
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
    // The static capture server has no Spring controller to inject the flag.
    await context.addInitScript((loginEnabled) => {
      globalThis.STIRLING_PDF_ENABLE_LOGIN = loginEnabled;
    }, mockOpts.enableLogin === true);
    const page = await context.newPage();
    await mockAppApis(page, mockOpts);
    await page.goto(`${serverOrigin}${routePath}`, { waitUntil: "load" });
    for (const selector of readySelectors) {
      await page.waitForSelector(selector, { timeout: 60_000 });
    }
    await page.evaluate(
      (minCount) => globalThis.__shellReady(3, 100, 30_000, minCount),
      minReadyCount,
    );
    // Text metrics must be final before the markup is serialized.
    await page.evaluate(() => globalThis.document.fonts?.ready);
    await page.evaluate(() => globalThis.__shellInlineImages());

    const critical = await page.evaluate(() => globalThis.__shellCritical());
    const captured = await page.evaluate(
      (sel) => globalThis.__shellMarkup(sel),
      markupSelector,
    );
    if (!captured)
      throw new Error(`the route ${routePath} rendered no ${markupSelector}`);
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

/** Deduplicates top-level rules across wide, narrow, and login critical CSS and drops empty blocks and unused keyframes. */
function mergeCriticalCss(cssList, combinedMarkup) {
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
  const sources = Array.isArray(cssList) ? cssList : [cssList];
  let merged = [
    ...new Set(splitRules(sources.filter(Boolean).join("\n"))),
  ].join("\n");
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
function shellScript({ wide, narrow, login }) {
  const langs = Object.keys(wide.strings);
  const payload = JSON.stringify({
    base: wide.base,
    rtl: wide.rtl,
    nodes: {
      wide: wide.nodes,
      narrow: narrow?.nodes ?? 0,
      login: login?.nodes ?? 0,
    },
    langs,
    // Base language strings are already in the DOM markup; non-base packs live in `dist/shells/<lang>.json`.
    strings: {},
  }).replace(/</g, "\\u003c");
  return [
    `<script id="shell-strings" type="application/json">${payload}</script>`,
    `<script>(function(){var root=document.getElementById("root");if(!root)return;` +
      `function clearShells(){var s=root.querySelectorAll("[data-shell-for]");for(var i=0;i<s.length;i++)s[i].remove();}` +
      // Keep both responsive app shells, but drop whichever kind this page cannot show.
      `function prune(active){var s=root.querySelectorAll("[data-shell-for]");for(var i=0;i<s.length;i++){var name=s[i].getAttribute("data-shell-for");if(active==="login"?name!=="login":name==="login")s[i].remove();}}` +
      `var isEditorPath=document.documentElement.getAttribute("data-shell-route")==="editor";` +
      `var isLoginMode=document.documentElement.getAttribute("data-shell-mode")==="login";` +
      // Some flavours have no login page, so the capture dropped that shell.
      `if(isLoginMode&&!root.querySelector("[data-shell-for=\\"login\\"]")){document.documentElement.removeAttribute("data-shell-mode");document.documentElement.setAttribute("data-shell-login","0");isLoginMode=false;}` +
      `if(!isLoginMode&&(!isEditorPath||document.documentElement.hasAttribute("data-shell-hidden"))){clearShells();root.removeAttribute("data-shell");document.documentElement.setAttribute("data-shell-hidden","");return;}`,
    `function drop(){if(!root.hasAttribute("data-shell"))return;root.removeAttribute("data-shell");if(window.__spdfBoot)window.__spdfBoot();}`,
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
    `var active=document.documentElement.getAttribute("data-shell-mode")==="login"?"login":(matchMedia("(max-width: 1024px)").matches?"narrow":"wide");`,
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
    `prune(active);`,
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
function deferEntry(html, loginChunk) {
  const entry = ENTRY_TAG.exec(html);
  if (!entry) throw new Error("index.html has no module entry script");
  const hints = [
    ...html.matchAll(
      /<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"[^>]*>/g,
    ),
  ]
    .map((match) => match[1])
    .filter((href) => href !== entry[1] && href !== loginChunk);
  const styleHints = [
    ...html.matchAll(
      /<link\b[^>]*\brel="preload"[^>]*\bas="style"[^>]*\bhref="([^"]+)"[^>]*>/g,
    ),
  ].map((match) => match[1]);
  // The tab icon and the manifest are fetched after the first paint, not before it.
  const meta = [
    ...html.matchAll(
      /<link\b[^>]*\brel="(icon|apple-touch-icon|manifest)"[^>]*\bhref="([^"]+)"[^>]*>/g,
    ),
  ].map((match) => ({ rel: match[1], href: match[2] }));
  const payload = JSON.stringify({
    src: entry[1],
    hints,
    styleHints,
    meta,
    ...(loginChunk ? { loginChunk } : {}),
  }).replace(/</g, "\\u003c");
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
  const withPayload = held(html).replace(
    ENTRY_TAG,
    `<script id="app-entry" type="application/json">${payload}</script>`,
  );
  // Vite hoists the entry tag into <head>. Keep the boot logic at the end of
  // <body>, after the pre-paint shell script has decided the route.
  const bootScript =
    "<script>(function(){var booted=false;" +
    'var entry=document.getElementById("app-entry");if(!entry)return;' +
    "var payload=JSON.parse(entry.textContent);var src=payload.src;" +
    // Hints and sheets arrive with the app rather than before its first paint.
    "function restore(){var hints=payload.hints||[];" +
    'for(var h=0;h<hints.length;h++){var hint=document.createElement("link");hint.rel="modulepreload";' +
    'hint.crossOrigin="anonymous";hint.href=hints[h];document.head.appendChild(hint);}' +
    "var styleHints=payload.styleHints||[];" +
    'for(var q=0;q<styleHints.length;q++){var sh=document.createElement("link");sh.rel="preload";sh.as="style";' +
    'sh.crossOrigin="anonymous";sh.href=styleHints[q];document.head.appendChild(sh);}' +
    'var lng=document.documentElement.lang||"en-US";var targetLng=lng==="en"?"en-US":lng;' +
    'var pLngs=targetLng==="en-US"?["en-US"]:[targetLng,"en-US"];' +
    'for(var p=0;p<pLngs.length;p++){var lp=document.createElement("link");lp.rel="preload";lp.as="fetch";lp.crossOrigin="anonymous";' +
    'lp.href=new URL("locales/"+pLngs[p]+"/translation.toml",document.baseURI).href;document.head.appendChild(lp);}' +
    'var meta=payload.meta||[];for(var m=0;m<meta.length;m++){var icon=document.createElement("link");' +
    "icon.rel=meta[m].rel;icon.href=meta[m].href;document.head.appendChild(icon);}" +
    'var enableSheets=function(){var links=document.querySelectorAll("link[data-href]");' +
    'for(var k=0;k<links.length;k++){var l=links[k];l.href=l.getAttribute("data-href");l.removeAttribute("data-href");l.disabled=false;}};' +
    'if(document.readyState==="loading"){addEventListener("DOMContentLoaded",enableSheets,{once:true});}else{enableSheets();}}' +
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
    "var loginGate=false;function boot(){if(booted||loginGate)return;booted=true;restore();" +
    'var script=document.createElement("script");script.type="module";script.crossOrigin="anonymous";script.setAttribute("fetchpriority","high");script.src=src;' +
    "script.onerror=function(){booted=false;};" +
    "document.head.appendChild(script);" +
    "restoreInput();}" +
    "window.__spdfBoot=boot;" +
    // A deep link is an app page from its first frame: boot at once, keep the
    // landing shell hidden until React paints over it.
    // The pre-paint script already resolved the route and auth state.
    'var route=document.documentElement.getAttribute("data-shell-route")||"";' +
    'var isLoginCurPath=route==="login";' +
    // A failed language pack drops the shell before this script exists; boot
    // instead of waiting for a gesture on a blank page.
    'if(!document.querySelector("[data-shell-for]")){boot();return;}' +
    'if(route!=="editor"&&!isLoginCurPath){' +
    'document.documentElement.setAttribute("data-shell-hidden","");' +
    'var r=document.getElementById("root");if(r){var s=r.querySelectorAll("[data-shell-for]");for(var i=0;i<s.length;i++)s[i].remove();r.removeAttribute("data-shell");}' +
    "boot();return;}" +
    'var reqLoginSession=document.documentElement.getAttribute("data-shell-login")==="1";' +
    // The login route is a lazy chunk. Fetch it while the shell is still on
    // screen, then boot; redirecting first would leave a blank.
    "if(reqLoginSession){" +
    'if(payload.loginChunk){loginGate=true;var loginLink=document.createElement("link");' +
    'loginLink.rel="modulepreload";loginLink.crossOrigin="anonymous";' +
    "loginLink.href=new URL(payload.loginChunk,document.baseURI).href;" +
    "var loginReady=false;var bootAfterLogin=function(){if(loginReady)return;loginReady=true;loginGate=false;boot();};" +
    "loginLink.onload=bootAfterLogin;loginLink.onerror=bootAfterLogin;" +
    "document.head.appendChild(loginLink);setTimeout(bootAfterLogin,2000);" +
    "}else{setTimeout(boot,50);}" +
    "}else if(isLoginCurPath){setTimeout(boot,50);}" +
    'if(typeof navigator!=="undefined"&&navigator.webdriver){if(document.readyState==="loading"){addEventListener("DOMContentLoaded",boot,{once:true});}else{boot();}return;}' +
    // The shell is the first screen, so the app waits for a gesture or idle window.
    'var triggers=["pointerdown","keydown","touchstart","wheel","focusin","dragenter","paste"];' +
    "for(var i=0;i<triggers.length;i++)addEventListener(triggers[i],boot,{once:true,passive:true});" +
    'setTimeout(function(){if("requestIdleCallback" in window){requestIdleCallback(boot,{timeout:1000});}else{boot();}},1000);' +
    'addEventListener("dragenter",function(e){if(document.querySelector("[data-shell-for]"))e.preventDefault();},true);' +
    'addEventListener("dragover",function(e){if(document.querySelector("[data-shell-for]")){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect="copy";}},true);' +
    'addEventListener("drop",function(e){if(!document.querySelector("[data-shell-for]"))return;e.preventDefault();var f=e.dataTransfer&&e.dataTransfer.files;if(f&&f.length){pending=f;boot();handOff();}},true);' +
    "var pendingButtonSelector=null;" +
    "function esc(v){return window.CSS&&CSS.escape?CSS.escape(String(v)):String(v);}" +
    'addEventListener("click",function(event){if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;' +
    'var t=event.target;if(!t||!t.closest||!t.closest("[data-shell-for]"))return;' +
    'var btn=t.closest("button[data-testid=\\"files-button\\"],button[data-testid=\\"pdf-library-add-files\\"],button.sui-btn--primary");' +
    'if(btn){var sh=btn.closest("[data-shell-for]");var fi=sh&&sh.querySelector("input[type=file]");if(fi){fi.click();boot();return;}}' +
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
    'if(genericBtn.getAttribute("type")==="submit")pendingButtonSelector="button[type=submit]";' +
    'else if(testId)pendingButtonSelector="button[data-testid=\\""+esc(testId)+"\\"]";' +
    'else if(aria)pendingButtonSelector="button[aria-label=\\""+esc(aria)+"\\"]";' +
    'else if(genericBtn.className)pendingButtonSelector="button."+genericBtn.className.split(" ").filter(Boolean).map(esc).join(".");' +
    "boot();handOff();return;}" +
    "},true);" +
    "var pending=null;var tries=0;" +
    "function onChange(event){var target=event.target;" +
    'if(!target||target.tagName!=="INPUT"||target.type!=="file"||!target.closest||!target.closest("[data-shell-for]")||!target.files||!target.files.length)return;' +
    'removeEventListener("change",onChange,true);pending=target.files;boot();handOff();}' +
    'addEventListener("change",onChange,true);' +
    // A static login form must not reload the document before the app boots.
    'addEventListener("submit",function(e){if(e.target&&e.target.closest&&e.target.closest("[data-shell-for]")){e.preventDefault();boot();}},true);' +
    "function handOff(){" +
    'if(document.querySelector("[data-shell-for]")&&tries++<200){setTimeout(handOff,50);return;}' +
    "if(pendingButtonSelector){var b=null;try{b=document.querySelector(pendingButtonSelector);}catch(e){}" +
    "if(b&&!b.disabled){b.click();pendingButtonSelector=null;}else if(tries++<200){setTimeout(handOff,50);return;}}" +
    "if(!pending)return;" +
    'var input=document.querySelector("input[type=file]");' +
    "if(!input){if(tries++<200){setTimeout(handOff,50);return;}pending=null;return;}" +
    "var files=pending;pending=null;" +
    "try{var carrier=new DataTransfer();for(var j=0;j<files.length;j++)carrier.items.add(files[j]);" +
    'input.files=carrier.files;input.dispatchEvent(new Event("change",{bubbles:true}));}catch(e){}}' +
    "})();</script>";
  const bodyEnd = withPayload.lastIndexOf("</body>");
  return bodyEnd === -1
    ? withPayload + bootScript
    : `${withPayload.slice(0, bodyEnd)}${bootScript}${withPayload.slice(bodyEnd)}`;
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
  defaultLogin = true,
  loginChunk = null,
}) {
  const { chromium } = await import("@playwright/test");
  const execPath = resolveChromiumExecutablePath(chromium);

  const { mockAppApis } = await loadStubHelper(editorDir);
  let server = null;
  let browser = null;
  let wide = null;
  let narrow = null;
  let login = null;

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

    [wide, narrow, login] = await Promise.all([
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
      captureShellPage({
        browser,
        serverOrigin: server.origin,
        mockAppApis,
        viewport: { width: 1350, height: 940 },
        distDir,
        editorDir,
        routePath: "/login",
        readySelectors: ["#root form"],
        markupSelector: "form",
        minReadyCount: 5,
        mockOpts: { enableLogin: true },
      }).catch((err) => {
        console.warn("[prerender-shell] login capture skipped:", err);
        return null;
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
  // The login form ships with its submit disabled until React validates the
  // fields. The static shell has no validation, and a disabled button cannot
  // start the boot/handoff path; enable it and let the app reject bad input.
  if (login) {
    login.markup = login.markup.replace(
      /<button\b([^>]*)>/gi,
      (_tag, attrs) => {
        const enabled = attrs.replace(
          /\s(?:disabled|aria-disabled|data-disabled)(?:="[^"]*")?/gi,
          "",
        );
        return `<button${enabled}>`;
      },
    );
  }
  const criticalCss = mergeCriticalCss(
    [wide.critical, narrow ? narrow.critical : "", login ? login.critical : ""],
    `${wide.markup}\n${narrow ? narrow.markup : ""}\n${login ? login.markup : ""}`,
  );
  const stateScript = `${SHELL_STATE_START}${shellStateScript(defaultLogin)}${SHELL_STATE_END}`;
  const withState = (pageHtml) =>
    pageHtml.replace(/<body([^>]*)>/i, (match) => `${match}${stateScript}`);
  // Without a phone capture, keep the wide shell visible rather than hiding
  // it behind a media query with no narrow replacement.
  const narrowCss = narrow
    ? '@media (max-width: 1024px){[data-shell-for="wide"]{display:none}[data-shell-for="narrow"]{display:block}}'
    : "";
  const shellCss =
    '#root[data-shell="pending"]{visibility:hidden}' +
    '[data-shell-hidden] #root[data-shell="pending"]{visibility:hidden!important}' +
    "[data-shell-hidden] [data-shell-for]{display:none!important}" +
    '[data-shell-for="narrow"]{display:none}' +
    '[data-shell-for="login"]{display:none}' +
    narrowCss +
    '[data-shell-mode="login"] [data-shell-for="wide"]{display:none!important}' +
    '[data-shell-mode="login"] [data-shell-for="narrow"]{display:none!important}' +
    '[data-shell-mode="login"] [data-shell-for="login"]{display:block!important}';
  const emitted = [
    SHELL_START,
    `<style>${shellCss}</style>`,
    `<noscript><style>#root[data-shell="pending"]{visibility:visible!important}</style></noscript>`,
    `<style id="shell-critical">${criticalCss}</style>`,
    `<div id="root" data-shell="pending"><div data-shell-for="wide">${wide.markup}</div>`,
    narrow ? `<div data-shell-for="narrow">${narrow.markup}</div>` : "",
    login ? `<div data-shell-for="login">${login.markup}</div>` : "",
    `</div>`,
    shellScript({ wide, narrow, login }),
    SHELL_END,
  ].join("");
  const withShell = withState(replaceRoot(html, emitted));
  await writeFile(indexPath, deferEntry(withShell, loginChunk));
  const editorPath = join(distDir, "editor.html");
  if (existsSync(editorPath)) {
    const editorHtml = stripShell(await readFile(editorPath, "utf8"));
    const editorWithShell = withState(replaceRoot(editorHtml, emitted));
    await writeFile(editorPath, deferEntry(editorWithShell, loginChunk));
  }
  const loginPages = ["login.html", "signup.html"];
  for (const name of loginPages) {
    const pagePath = join(distDir, name);
    if (existsSync(pagePath)) {
      const pageHtml = stripShell(await readFile(pagePath, "utf8"));
      // The pre-paint state script decides this; hard-coding login mode would
      // show the login form to an already signed-in visitor.
      const pageWithShell = withState(replaceRoot(pageHtml, emitted));
      await writeFile(pagePath, deferEntry(pageWithShell, loginChunk));
    }
  }
  const shellsDir = join(distDir, "shells");
  await mkdir(shellsDir, { recursive: true });
  for (const language of Object.keys(wide.strings)) {
    if (language === wide.base) continue;
    const wideStrings = wide.strings[language];
    const narrowStrings = narrow?.strings[language];
    const loginStrings = login?.strings[language];
    const pack = !narrowStrings
      ? { wide: wideStrings }
      : JSON.stringify(narrowStrings) === JSON.stringify(wideStrings)
        ? { both: wideStrings }
        : { wide: wideStrings, narrow: narrowStrings };
    if (loginStrings) {
      pack.login = loginStrings;
    }
    await writeFile(join(shellsDir, `${language}.json`), JSON.stringify(pack));
  }
  return {
    nodes: wide.nodes,
    languages: languageCount,
    dropped: wide.dropped,
    bytes: Buffer.byteLength(emitted),
    narrowNodes: narrow?.nodes ?? 0,
    loginNodes: login?.nodes ?? 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const distDir = resolve(import.meta.dirname, "../dist");
  prerenderShell({ distDir })
    .then((result) =>
      console.log(
        `[prerender-shell] ${result.languages} languages, ${result.nodes} text nodes, ` +
          `${(result.bytes / 1024).toFixed(1)} KiB${result.narrowNodes ? `, phone shell ${result.narrowNodes} text nodes` : ""}${result.loginNodes ? `, login shell ${result.loginNodes} text nodes` : ""}${result.dropped.length ? `, no shell for ${result.dropped.join(", ")}` : ""}`,
      ),
    )
    .catch((error) => {
      console.error(
        `[prerender-shell] ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    });
}
