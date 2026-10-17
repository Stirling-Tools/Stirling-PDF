/**
 * Puts the landing screen's first paint into index.html.
 *
 * Nothing React renders exists until the Landing chunk's JavaScript parses and
 * runs, so the biggest paint on the landing screen waits on JavaScript. This
 * module renders `/` once against the built app, captures the markup, and
 * records the text of that screen in every delivered language, so a synchronous
 * script at the end of the body can put the resolved language's words in place
 * before the browser paints.
 *
 * The capture runs the app's own API stubs (`mockAppApis`), the same responses
 * the E2E specs and the audit server serve, so the shell is what a default
 * install renders. An install whose feature flags differ gets shell chrome that
 * React replaces; the language rule in the emitted script is the hard guard
 * against ever showing a visitor the wrong words, and a language the capture
 * could not reproduce gets no shell at all.
 */
import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
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

/**
 * The stub module imports only types from Playwright, so a plain transpile
 * leaves a module that evaluates in this process.
 */
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

/**
 * Installed on every navigation so the capture, the per-language passes and the
 * emitted script all agree on which text nodes count, and in which order.
 */
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
  /**
   * The source language's words stay in the markup: a text node emptied here
   * does not survive serialization, so the emitted script would have nothing to
   * write into. The style rule that hides the shell until those words are
   * replaced is what keeps them from ever reaching a paint.
   */
  // The whole of #root, not only the frame: the client hydrates this markup, so it has
  // to be exactly what React's first render produces, frame included.
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
  /**
   * The app frame is chrome, and it renders before the lazy landing route and
   * the startup dictionary arrive. Waiting on the frame alone can settle on the
   * chrome, and then every language disagrees with a base capture taken too
   * early, so this waits for the dictionary and a count that holds still.
   */
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

    const captured = await page.evaluate(() => globalThis.__shellMarkup());
    if (!captured) throw new Error("the landing screen rendered no app frame");
    // Assets imported as `new URL(..., import.meta.url)` resolve against the capture server,
    // so its origin would be baked into every visitor's first paint. A base-relative path
    // resolves against the document's <base> instead, which follows the deployment base.
    const markup = captured.split(`${server.origin}/`).join("");
    const nodes = await page.evaluate(() => globalThis.__shellCount());

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
    strings,
  }).replace(/</g, "\\u003c");
  return [
    `<script id="shell-strings" type="application/json">${payload}</script>`,
    `<script>(function(){var root=document.getElementById("root");if(!root)return;`,
    `function drop(){while(root.firstChild)root.removeChild(root.firstChild);root.removeAttribute("data-shell");}`,
    `try{var data=JSON.parse(document.getElementById("shell-strings").textContent);`,
    `var stored=null;try{stored=localStorage.getItem("i18nextLng");}catch(e){}`,
    `var language=stored&&data.strings[stored]?stored:navigator.language&&data.strings[navigator.language]?navigator.language:null;`,
    `if(!language){drop();return;}`,
    `var shell=data.strings[language];`,
    // Both shells are in the document and the stylesheet picks one, so the first
    // layout is already the final one; only the words have to change here.
    `if(!shell[matchMedia("(max-width: 1024px)").matches?"narrow":"wide"]){drop();return;}`,
    `var shells=root.querySelectorAll("[data-shell-for]");`,
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
    `if(src&&src.indexOf("://")<0&&src.charAt(0)!=="/"){images[k].setAttribute("src",new URL(src,document.baseURI).href);}}`,
    `if(data.rtl.indexOf(language)!==-1)document.documentElement.dir="rtl";`,
    `document.documentElement.lang=language;`,
    `root.removeAttribute("data-shell");`,
    `}catch(e){drop();}})();</script>`,
  ].join("");
}

/** The entry module tag Vite emits: an inline module script that boots the app. */
const ENTRY_TAG =
  /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/;

/**
 * Leaves the entry inert, and boots it after `load` or the first interaction.
 *
 * The shell is the first paint and needs none of the app's JavaScript, yet a phone
 * waits for every byte of it before that paint lands. The preload hints go with it:
 * they fetch the whole graph before anything paints from it, and the boot fetches the
 * same chunks when it runs. A tap starts the boot immediately - a person is waiting
 * on it, and they should never wait for `load`.
 */
function deferEntry(html) {
  const entry = ENTRY_TAG.exec(html);
  if (!entry) throw new Error("index.html has no module entry script");
  const payload = JSON.stringify({ src: entry[1] }).replace(/</g, "\\u003c");
  return html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, "").replace(
    ENTRY_TAG,
    `<script id="app-entry" type="application/json">${payload}</script>` +
      "<script>(function(){var booted=false;" +
      'var entry=document.getElementById("app-entry");if(!entry)return;' +
      "function boot(){if(booted)return;booted=true;" +
      'var script=document.createElement("script");script.type="module";' +
      'script.crossOrigin="anonymous";script.src=JSON.parse(entry.textContent).src;' +
      "document.head.appendChild(script);}" +
      // The landing is the one screen that paints from the shell alone, so it can wait;
      // a deep link (a tool, the editor) is an app page from its first frame, and its
      // controls must work the moment they appear.
      'var landing=document.baseURI;var here=location.href.split("#")[0].split("?")[0];' +
      'if(here.slice(-1)==="/")here=here.slice(0,-1);' +
      'if(landing.slice(-1)==="/")landing=landing.slice(0,-1);' +
      "if(here!==landing){document.write('<script type=\"module\" crossorigin src=\"'+JSON.parse(entry.textContent).src+'\"></'+'script>');return;}" +
      // The shell is the first screen, so the app waits for a gesture.
      'var triggers=["pointerdown","keydown","touchstart","wheel","focusin"];' +
      "for(var i=0;i<triggers.length;i++)addEventListener(triggers[i],boot,{once:true,passive:true});" +
      // A file picked before the app is up is carried over to its input.
      "var pending=null;" +
      'addEventListener("change",function(event){var target=event.target;' +
      'if(!target||target.tagName!=="INPUT"||target.type!=="file"||!target.files||!target.files.length)return;' +
      "pending=target.files;boot();handOff();},true);" +
      "function handOff(){if(!pending)return;" +
      'var input=document.querySelector("input[type=file]");' +
      "if(!input){setTimeout(handOff,50);return;}" +
      "try{var carrier=new DataTransfer();" +
      "for(var j=0;j<pending.length;j++)carrier.items.add(pending[j]);" +
      'input.files=carrier.files;input.dispatchEvent(new Event("change",{bubbles:true}));}catch(e){}' +
      "pending=null;}" +
      "})();</script>",
  );
}

export async function prerenderShell({
  distDir,
  editorDir = resolve(distDir, ".."),
}) {
  const wide = await captureShell({ distDir, editorDir });
  // The landing draws a different frame at a phone's width, and React hydrates
  // whichever one the visitor's viewport chose: a single shell mismatches on the
  // other side of the breakpoint and is thrown away.
  let narrow = null;
  try {
    narrow = await captureShell({
      distDir,
      editorDir,
      viewport: { width: 412, height: 823 },
    });
  } catch (error) {
    console.warn(
      `[prerender-shell] no phone-width shell: ${error instanceof Error ? error.message : error}`,
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
    // Both shells ship inline: the stylesheet picks the one the viewport draws, so
    // the browser's first layout is the final one and nothing moves when the words
    // are swapped in.
    `<style>#root[data-shell="pending"]{visibility:hidden}[data-shell-for="narrow"]{display:none}@media (max-width: 1024px){[data-shell-for="wide"]{display:none}[data-shell-for="narrow"]{display:block}}</style>`,
    `<div id="root" data-shell="pending"><div data-shell-for="wide">${wide.markup}</div>`,
    narrow ? `<div data-shell-for="narrow">${narrow.markup}</div>` : "",
    `</div>`,
    shellScript({ wide, narrow }),
    SHELL_END,
  ].join("");
  const withShell = html.replace(/(<div id="root"><\/div>)/, emitted);
  if (withShell === html)
    throw new Error('index.html has no <div id="root"></div>');
  await writeFile(indexPath, deferEntry(withShell));
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
