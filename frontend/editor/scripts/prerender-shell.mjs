/** Puts the landing screen's first paint into index.html. */
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
  const start = html.indexOf(SHELL_START);
  const end = html.indexOf(SHELL_END);
  if (start === -1 || end === -1 || end < start) return html;
  return html.slice(0, start) + html.slice(end + SHELL_END.length);
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
      const { port } = server.address();
      ready({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/** The stub module imports only types from Playwright, so a plain transpile leaves a module that evaluates in. */
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

/** Installed on every navigation so the capture, the per-language passes and the emitted script all agree on. */
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
  /** The source language's words stay in the markup: a text node emptied here does not survive serialization, so. */
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
        const test = part.trim();
        if (!test || test.includes("::")) return true;
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
    // A custom property nothing in the shell reads is a byte the visitor pays for.
    const markup = root.outerHTML;
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
    // Exactly what React rendered: an extra attribute here is an extra attribute
    // the client cannot account for, and hydration fails on it.
    return root.innerHTML;
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
        if (globalThis.i18next?.isInitialized && count === previous) {
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

export async function captureShell({
  distDir,
  editorDir,
  viewport = { width: 1350, height: 940 },
}) {
  const { chromium } = await import("@playwright/test");
  const { mockAppApis } = await loadStubHelper(editorDir);
  const server = await startStaticServer(distDir);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport });
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
    await page.goto(`${server.origin}/`, { waitUntil: "load" });
    await page.waitForSelector("#root .app-frame", { timeout: 60_000 });
    await page.evaluate(() => globalThis.__shellReady(10, 500, 120_000));
    await page.evaluate(() => globalThis.__shellInlineImages());

    const captured = await page.evaluate(() => globalThis.__shellMarkup());
    if (!captured) throw new Error("the landing screen rendered no app frame");
    // Assets imported as `new URL(..., import.meta.url)` resolve against the capture server, so its origin would be.
    const markup = captured.split(`${server.origin}/`).join("");
    const nodes = await page.evaluate(() => globalThis.__shellCount());
    const critical = await page.evaluate(() => globalThis.__shellCritical());

    const strings = {};
    const dropped = [];
    for (const language of await deliveredLanguages(distDir)) {
      await page.evaluate(
        (next) => globalThis.i18next.changeLanguage(next),
        language,
      );
      await page.evaluate(() => globalThis.__shellSettled(30_000));
      const texts = await page.evaluate(() => globalThis.__shellTexts());
      if (texts.length === nodes) strings[language] = texts;
      else dropped.push(`${language} (${texts.length})`);
    }
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
    await browser.close();
    await server.close();
  }
}

/** The resolver has to run before paint and must never leave wrong words up. */
function shellScript({ wide, narrow }) {
  const strings = {};
  for (const [language, texts] of Object.entries(wide.strings)) {
    strings[language] = { wide: texts };
    if (narrow?.strings[language]) {
      strings[language].narrow = narrow.strings[language];
    }
  }
  const payload = JSON.stringify({
    base: wide.base,
    rtl: wide.rtl,
    nodes: { wide: wide.nodes, narrow: narrow?.nodes ?? 0 },
    langs: Object.keys(strings),
    // Only the base language's words ride the document; the rest live in
    // `dist/shells/<language>.json` and are fetched when they are needed.
    strings: { [wide.base]: strings[wide.base] },
  }).replace(/</g, "\\u003c");
  return [
    `<script id="shell-strings" type="application/json">${payload}</script>`,
    `<script>(function(){var root=document.getElementById("root");if(!root)return;`,
    `function drop(){while(root.firstChild)root.removeChild(root.firstChild);root.removeAttribute("data-shell");if(window.__spdfBoot)window.__spdfBoot();}`,
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
    `function apply(shell){try{`,
    // Both shells are in the document and the stylesheet picks one, so the first
    // layout is already the final one; only the words have to change here.
    `var active=matchMedia("(max-width: 1024px)").matches?"narrow":"wide";`,
    `if(!shell[active]){drop();return;}`,
    `var shells=root.querySelectorAll("[data-shell-for]");`,
    // Two copies of an id confuse a label or a search box that looks one up, so the
    // shell the viewport does not draw gives its ids up.
    `for(var s=0;s<shells.length;s++)if(shells[s].getAttribute("data-shell-for")!==active){`,
    `var staled=shells[s].querySelectorAll("[id]");for(var t=0;t<staled.length;t++)staled[t].removeAttribute("id");}`,
    `for(var i=0;i<shells.length;i++){var name=shells[i].getAttribute("data-shell-for");`,
    `var list=shell[name];if(!list)continue;`,
    `if(list.length!==data.nodes[name]){drop();return;}`,
    `var walker=document.createTreeWalker(shells[i],NodeFilter.SHOW_TEXT);var texts=[];`,
    `while(walker.nextNode()){var node=walker.currentNode;var parent=node.parentElement;`,
    `if(!parent||parent.tagName==="SCRIPT"||parent.tagName==="STYLE")continue;`,
    `if(!node.nodeValue||!node.nodeValue.trim())continue;texts.push(node);}`,
    `if(texts.length!==list.length){drop();return;}`,
    `for(var j=0;j<texts.length;j++)texts[j].nodeValue=list[j];}`,
    // React builds these through `new URL(..., import.meta.url)`, which is absolute;
    // the capture stores them base-relative so the markup follows the deployment base.
    `var images=root.querySelectorAll("img[src]");`,
    `for(var k=0;k<images.length;k++){var src=images[k].getAttribute("src");`,
    `if(src&&src.indexOf("://")<0&&src.indexOf("data:")!==0&&src.charAt(0)!=="/"){images[k].setAttribute("src",new URL(src,document.baseURI).href);}}`,
    `if(data.rtl.indexOf(language)!==-1)document.documentElement.dir="rtl";`,
    `document.documentElement.lang=language;`,
    `root.removeAttribute("data-shell");`,
    `}catch(e){drop();}}`,
    // The base language is in the document; every other one loads its words first,
    // and a shell that cannot get them stays hidden and boots the app instead.
    `var inline=data.strings[language];`,
    `if(inline){apply(inline);}else{`,
    `fetch(new URL("shells/"+encodeURIComponent(language)+".json",document.baseURI))`,
    `.then(function(response){return response.ok?response.json():null;})`,
    `.then(function(shell){if(shell)apply(shell);else drop();},function(){drop();});}`,
    `}catch(e){drop();}})();</script>`,
  ].join("");
}

/** The entry module tag Vite emits: an inline module script that boots the app. */
const ENTRY_TAG =
  /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/;

/** Leaves the entry inert and boots it on the first gesture, a deep link or a file, so the shell's paint never. */
function deferEntry(html) {
  const entry = ENTRY_TAG.exec(html);
  if (!entry) throw new Error("index.html has no module entry script");
  const hints = [
    ...html.matchAll(
      /<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"[^>]*>/g,
    ),
  ].map((match) => match[1]);
  const payload = JSON.stringify({ src: entry[1], hints }).replace(
    /</g,
    "\\u003c",
  );
  // The shell carries its own rules; the app's sheets and hints arrive with the app.
  const held = (page) =>
    page
      .replace(/<link\b[^>]*\brel="preload"[^>]*\bas="style"[^>]*>/g, "")
      .replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, "")
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
      'var links=document.querySelectorAll("link[data-href]");' +
      'for(var k=0;k<links.length;k++){var l=links[k];l.href=l.getAttribute("data-href");l.removeAttribute("data-href");l.disabled=false;}}' +
      "var focused=document.activeElement;" +
      'var keepId=focused&&focused.tagName==="INPUT"&&focused.id?focused.id:null;' +
      "var keepValue=keepId?focused.value:null;" +
      // A tap on a search box must not lose what was typed while the shell was up.
      'function boot(){if(booted)return;booted=true;removeEventListener("change",onChange,true);' +
      "restore();" +
      "if(window.__spdfLocalePreload)window.__spdfLocalePreload();" +
      'var script=document.createElement("script");script.type="module";' +
      'script.crossOrigin="anonymous";script.src=src;document.head.appendChild(script);' +
      "if(keepId){var tried=0;(function refocus(){var el=document.getElementById(keepId);" +
      'if(el&&!el.closest("[data-shell-for]")){el.value=keepValue;el.focus();return;}' +
      "if(tried++<200)setTimeout(refocus,50);})();}}" +
      "window.__spdfBoot=boot;" +
      // A deep link is an app page from its first frame, so it boots at once, and the
      // landing shell it would otherwise flash is dropped.
      'var clean=function(url){var cut=url.split("#")[0].split("?")[0];' +
      'if(cut.slice(-11)==="/index.html")cut=cut.slice(0,-11);' +
      'while(cut.slice(-1)==="/")cut=cut.slice(0,-1);return cut;};' +
      "if(clean(location.href)!==clean(document.baseURI)){" +
      'var first=document.getElementById("root");if(first){while(first.firstChild)first.removeChild(first.firstChild);first.removeAttribute("data-shell");}' +
      "restore();document.write('<script type=\"module\" crossorigin src=\"'+src+'\"></'+'script>');return;}" +
      // The shell is the first screen, so the app waits for a gesture.
      'var triggers=["pointerdown","keydown","touchstart","wheel","focusin","dragenter","paste"];' +
      "for(var i=0;i<triggers.length;i++)addEventListener(triggers[i],boot,{once:true,passive:true});" +
      // A shell link boots and routes, instead of a page load the app then undoes.
      'addEventListener("click",function(event){if(booted)return;' +
      'var link=event.target&&event.target.closest?event.target.closest("a[href]"):null;' +
      'if(!link)return;var href=link.getAttribute("href");' +
      'if(!href||href.charAt(0)==="#"||/^[a-z]+:/i.test(href))return;' +
      "event.preventDefault();boot();" +
      'var waited=0;(function route(){if(document.querySelector("[data-shell-for]")&&waited++<200){setTimeout(route,50);return;}' +
      'try{history.pushState({},"",href);dispatchEvent(new PopStateEvent("popstate"));}catch(e){location.href=href;}})();},true);' +
      // A file picked before the app is up is carried over to its input.
      "var pending=null;var tries=0;" +
      "function onChange(event){var target=event.target;" +
      'if(!target||target.tagName!=="INPUT"||target.type!=="file"||!target.files||!target.files.length)return;' +
      "pending=target.files;boot();handOff();}" +
      'addEventListener("change",onChange,true);' +
      "function handOff(){if(!pending)return;" +
      'if(document.querySelector("[data-shell-for]")&&tries++<200){setTimeout(handOff,50);return;}' +
      'var input=document.querySelector("input[type=file]");' +
      "if(!input){pending=null;return;}" +
      "var files=pending;pending=null;" +
      "try{var carrier=new DataTransfer();" +
      "for(var j=0;j<files.length;j++)carrier.items.add(files[j]);" +
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
  const wide = await captureShell({ distDir, editorDir });
  // The landing draws a different frame at a phone's width, and React hydrates whichever one the visitor's.
  let narrow = null;
  try {
    narrow = await captureShell({
      distDir,
      editorDir,
      viewport: { width: 412, height: 823 },
    });
  } catch (error) {
    throw new Error(
      `the phone-width shell did not render: ${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
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
  const emitted = [
    SHELL_START,
    // Both shells ship inline: the stylesheet picks the one the viewport draws, so the browser's first layout is.
    `<style>#root[data-shell="pending"]{visibility:hidden}[data-shell-for="narrow"]{display:none}@media (max-width: 1024px){[data-shell-for="wide"]{display:none}[data-shell-for="narrow"]{display:block}}</style>`,
    `<style id="shell-critical">${wide.critical}${narrow ? narrow.critical : ""}</style>`,
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
    const both = { wide: wide.strings[language] };
    if (narrow?.strings[language]) both.narrow = narrow.strings[language];
    await writeFile(join(shellsDir, `${language}.json`), JSON.stringify(both));
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
