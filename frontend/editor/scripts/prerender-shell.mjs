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
    let filePath = resolve(root, normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, ""));
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      filePath = join(root, "index.html");
    }
    try {
      let body = await readFile(filePath);
      if (filePath.endsWith("index.html")) body = Buffer.from(stripShell(body.toString("utf8")));
      response.writeHead(200, {
        "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
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
    while (walker.nextNode()) if (accepts(walker.currentNode)) nodes.push(walker.currentNode);
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
  globalThis.__shellMarkup = () => {
    const frame = document.querySelector("#root .app-frame");
    if (!frame) return null;
    const copy = frame.cloneNode(true);
    copy.setAttribute("data-shell-frame", "");
    return copy.outerHTML;
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
  const entries = await readdir(join(distDir, "locales"), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function captureShell({ distDir, editorDir, viewport = { width: 1350, height: 940 } }) {
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

    const markup = await page.evaluate(() => globalThis.__shellMarkup());
    if (!markup) throw new Error("the landing screen rendered no app frame");
    const nodes = await page.evaluate(() => globalThis.__shellCount());

    const strings = {};
    const dropped = [];
    for (const language of await deliveredLanguages(distDir)) {
      await page.evaluate((next) => globalThis.i18next.changeLanguage(next), language);
      await page.evaluate(() => globalThis.__shellSettled(30_000));
      const texts = await page.evaluate(() => globalThis.__shellTexts());
      if (texts.length === nodes) strings[language] = texts;
      else dropped.push(`${language} (${texts.length})`);
    }
    const rtl = (await readFile(join(editorDir, "src/core/i18n/languages.ts"), "utf8")).match(
      /rtlLanguages\s*=\s*\[([^\]]*)\]/,
    );
    return {
      markup,
      nodes,
      strings,
      dropped,
      rtl: rtl ? [...rtl[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]) : [],
      base: SHELL_LANGUAGE,
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

/** The resolver has to run before paint and must never leave wrong words up. */
function shellScript(shell) {
  const payload = JSON.stringify({
    base: shell.base,
    rtl: shell.rtl,
    strings: shell.strings,
  }).replace(/</g, "\\u003c");
  return [
    `<script id="shell-strings" type="application/json">${payload}</script>`,
    `<script>(function(){var root=document.getElementById("root");if(!root)return;`,
    `function drop(){var frame=root.querySelector("[data-shell-frame]");if(frame)frame.remove();root.removeAttribute("data-shell");}`,
    `try{var data=JSON.parse(document.getElementById("shell-strings").textContent);`,
    `var stored=null;try{stored=localStorage.getItem("i18nextLng");}catch(e){}`,
    `var language=stored&&data.strings[stored]?stored:navigator.language&&data.strings[navigator.language]?navigator.language:null;`,
    `if(!language){drop();return;}`,
    `var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);var nodes=[];`,
    `while(walker.nextNode()){var node=walker.currentNode;var parent=node.parentElement;`,
    `if(!parent||parent.tagName==="SCRIPT"||parent.tagName==="STYLE")continue;`,
    `if(!node.nodeValue||!node.nodeValue.trim())continue;nodes.push(node);}`,
    `var strings=data.strings[language];if(nodes.length!==strings.length){drop();return;}`,
    `for(var i=0;i<nodes.length;i++)nodes[i].nodeValue=strings[i];`,
    `if(data.rtl.indexOf(language)!==-1)document.documentElement.dir="rtl";`,
    `document.documentElement.lang=language;root.removeAttribute("data-shell");`,
    `}catch(e){drop();}})();</script>`,
  ].join("");
}

export async function prerenderShell({ distDir, editorDir = resolve(distDir, "..") }) {
  const shell = await captureShell({ distDir, editorDir });
  const indexPath = join(distDir, "index.html");
  const html = stripShell(await readFile(indexPath, "utf8"));
  const languageCount = Object.keys(shell.strings).length;
  if (languageCount === 0) {
    throw new Error(
      `no language reproduced the captured text nodes (base ${shell.nodes} nodes; ` +
        `saw ${shell.dropped.slice(0, 5).join(", ") || "nothing"})`,
    );
  }
  const emitted = [
    SHELL_START,
    `<style>#root[data-shell="pending"]{visibility:hidden}</style>`,
    `<div id="root" data-shell="pending">${shell.markup}</div>`,
    shellScript(shell),
    SHELL_END,
  ].join("");
  const withShell = html.replace(/(<div id="root"><\/div>)/, emitted);
  if (withShell === html) throw new Error('index.html has no <div id="root"></div>');
  await writeFile(indexPath, withShell);
  return {
    nodes: shell.nodes,
    languages: languageCount,
    dropped: shell.dropped,
    bytes: Buffer.byteLength(emitted),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const distDir = resolve(import.meta.dirname, "../dist");
  prerenderShell({ distDir })
    .then((result) =>
      console.log(
        `[prerender-shell] ${result.languages} languages, ${result.nodes} text nodes, ` +
          `${(result.bytes / 1024).toFixed(1)} KiB${result.dropped.length ? `, no shell for ${result.dropped.join(", ")}` : ""}`,
      ),
    )
    .catch((error) => {
      console.error(`[prerender-shell] ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
