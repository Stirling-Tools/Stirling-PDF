#!/usr/bin/env node
// Local patches for the pinned @embedpdf plugins: interaction-manager emits
// onHandlerChange per handler registration and search dispatches per result
// page, so a jump or query in a large document re-resolves handlers and
// subscribers hundreds of times. Both batch into one microtask, which keeps the
// contract that listeners run before the next task. Delete once the plugins
// batch natively.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_VERSION = "2.15.0";
const MARKER = "STIRLING_LOCAL_EMBEDPDF_PLUGIN_PATCH";
const checkOnly = process.argv.includes("--check");
const nodeModulesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../node_modules",
);

function loadPackage(name, relTarget = "dist/index.js") {
  const dir = path.join(nodeModulesDir, name);
  const packageJsonPath = path.join(dir, "package.json");
  const target = path.join(dir, relTarget);
  if (!existsSync(target) || !existsSync(packageJsonPath)) {
    console.error(
      `[patch-embedpdf-plugins] ${name} is not installed; cannot verify the local patches`,
    );
    process.exit(checkOnly ? 1 : 0);
  }
  const installedVersion = JSON.parse(
    readFileSync(packageJsonPath, "utf8"),
  ).version;
  if (installedVersion !== EXPECTED_VERSION) {
    console.error(
      `[patch-embedpdf-plugins] expected ${name}@${EXPECTED_VERSION}, found ${installedVersion}. ` +
        "Re-verify every patch anchor against the new version before updating EXPECTED_VERSION.",
    );
    process.exit(1);
  }
  return { name, target, source: readFileSync(target, "utf8") };
}

function fail(name, label) {
  console.error(
    `[patch-embedpdf-plugins] anchor not found for "${label}" in ${name}@${EXPECTED_VERSION}. ` +
      "The patch must be re-verified against this version.",
  );
  process.exit(1);
}

// --- interaction-manager: batch onHandlerChange emits -----------------------
const EMIT_SITES = 6;
const emitSnippet = "this.onHandlerChange$.emit({ ...this.state });";
const callSnippet = "this.__stirlingScheduleHandlerChange();";
const emitHelperSnippet = `__stirlingScheduleHandlerChange() {
    if (this.__stirlingHandlerChangeQueued) return;
    this.__stirlingHandlerChangeQueued = true;
    queueMicrotask(() => {
      this.__stirlingHandlerChangeQueued = false;
      this.onHandlerChange$.emit({ ...this.state });
    });
  } /* ${MARKER} */`;

function checkInteractionManager(pkg) {
  const rawEmits = pkg.source.split(emitSnippet).length - 1;
  const callSites = pkg.source.split(callSnippet).length - 1;
  return (
    pkg.source.includes(MARKER) && rawEmits === 1 && callSites === EMIT_SITES
  );
}

function applyInteractionManager(pkg) {
  if (pkg.source.includes(MARKER)) return pkg.source;
  const registerAnchor = `  registerHandlers({
    documentId,
    modeId,
    handlers,
    pageIndex
  }) {`;
  if (!pkg.source.includes(registerAnchor)) fail(pkg.name, "registerHandlers");
  const occurrences = pkg.source.split(emitSnippet).length - 1;
  if (occurrences !== EMIT_SITES) {
    console.error(
      `[patch-embedpdf-plugins] expected ${EMIT_SITES} emit sites, found ${occurrences}; re-verify against the installed version.`,
    );
    process.exit(1);
  }
  // Replace the call sites first: the helper below still needs a real emit,
  // and a blanket replace after insertion would rewrite the helper into a
  // self-call.
  let source = pkg.source.split(emitSnippet).join(callSnippet);
  source = source.replace(
    registerAnchor,
    `  ${emitHelperSnippet}\n${registerAnchor}`,
  );
  return source;
}

// --- tiling: abort stale tile renders and never mint an orphan blob URL ------
// TileImg's cleanup aborted only when no URL had been produced yet, so a tile
// that resolved after unmount still created an object URL that nothing revoked
// (fast scroll = orphan blobs). Guard the success callback, always mark the
// task aborted, and keep TilingLayer SSR-safe (window may be undefined in
// unsupported/embedded deployments).
const tileBlockFind = `    const task = scope.renderTile({ pageIndex, tile, dpr });
    task.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;
      setUrl(objectUrl);
    }, ignore);
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      } else {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: "canceled render task"
        });
      }
    };`;
const tileBlockReplace = `    let stirlingCancelled = false; /* ${MARKER} */
    const task = scope.renderTile({ pageIndex, tile, dpr });
    task.wait((blob) => {
      if (stirlingCancelled) return;
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;
      setUrl(objectUrl);
    }, ignore);
    return () => {
      stirlingCancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      } else {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: "canceled render task"
        });
      }
    };`;
const tileDprFind = "dpr: window.devicePixelRatio,";
const tileDprReplace =
  'dpr: typeof window !== "undefined" ? window.devicePixelRatio : 1,';

function checkTiling(pkg) {
  return (
    pkg.source.includes(MARKER) &&
    pkg.source.includes("if (stirlingCancelled) return;") &&
    pkg.source.includes(tileDprReplace) &&
    !pkg.source.includes(tileDprFind)
  );
}

function applyTiling(pkg) {
  if (pkg.source.includes(MARKER)) return pkg.source;
  if (!pkg.source.includes(tileBlockFind))
    fail(pkg.name, "TileImg render/cleanup");
  if (!pkg.source.includes(tileDprFind)) fail(pkg.name, "devicePixelRatio");
  let source = pkg.source.replace(tileBlockFind, () => tileBlockReplace);
  source = source.replace(tileDprFind, () => tileDprReplace);
  return source;
}

// --- search: batch searchAllPages progress dispatches ------------------------
const searchProgressFind = `    task.onProgress((p) => {
      var _a2;
      if ((_a2 = p == null ? void 0 : p.results) == null ? void 0 : _a2.length) {
        if (this.currentTask.get(documentId) === task) {
          this.dispatch(appendSearchResults(documentId, p.results));
          if (this.state.documents[documentId].activeResultIndex === -1) {
            this.dispatch(setActiveResultIndex(documentId, 0));
            this.notifyActiveResultChange(documentId, 0);
          }
        }
      }
    });`;
const searchProgressReplace = `    task.onProgress((p) => {
      var _a2;
      if ((_a2 = p == null ? void 0 : p.results) == null ? void 0 : _a2.length) {
        if (this.currentTask.get(documentId) === task) {
          this.__stirlingQueueSearchProgress(documentId, task, p.results);
        }
      }
    });`;
const searchHelperAnchor = "  stopSearchSession(documentId) {";
const searchHelperSnippet = `  __stirlingQueueSearchProgress(documentId, task, results) {
    if (!this.__stirlingSearchQueue) this.__stirlingSearchQueue = /* @__PURE__ */ new Map();
    let entry = this.__stirlingSearchQueue.get(documentId);
    if (!entry || entry.task !== task) {
      entry = { task, batches: [], queued: false };
      this.__stirlingSearchQueue.set(documentId, entry);
    }
    entry.batches.push(results);
    if (entry.queued) return;
    entry.queued = true;
    queueMicrotask(() => {
      entry.queued = false;
      const pending = entry.batches.splice(0);
      if (this.__stirlingSearchQueue.get(documentId) === entry) this.__stirlingSearchQueue.delete(documentId);
      if (this.currentTask.get(documentId) !== task || pending.length === 0) return;
      const merged = pending.length === 1 ? pending[0] : pending.flat();
      this.dispatch(appendSearchResults(documentId, merged));
      const docState = this.state.documents[documentId];
      if (docState && docState.activeResultIndex === -1) {
        this.dispatch(setActiveResultIndex(documentId, 0));
        this.notifyActiveResultChange(documentId, 0);
      }
    });
  } /* ${MARKER} */
`;

function checkSearch(pkg) {
  return (
    pkg.source.includes(searchHelperSnippet) &&
    pkg.source.includes(
      "this.__stirlingQueueSearchProgress(documentId, task, p.results);",
    )
  );
}

function applySearch(pkg) {
  if (pkg.source.includes(MARKER)) return pkg.source;
  if (!pkg.source.includes(searchProgressFind)) fail(pkg.name, "onProgress");
  if (!pkg.source.includes(searchHelperAnchor))
    fail(pkg.name, "stopSearchSession");
  let source = pkg.source.replace(
    searchProgressFind,
    () => searchProgressReplace,
  );
  source = source.replace(
    searchHelperAnchor,
    () => `${searchHelperSnippet}${searchHelperAnchor}`,
  );
  return source;
}

const jobs = [
  {
    name: "@embedpdf/plugin-interaction-manager",
    check: checkInteractionManager,
    apply: applyInteractionManager,
  },
  { name: "@embedpdf/plugin-search", check: checkSearch, apply: applySearch },
  {
    name: "@embedpdf/plugin-tiling",
    file: "dist/react/index.js",
    check: checkTiling,
    apply: applyTiling,
  },
];

if (checkOnly) {
  let failed = false;
  for (const job of jobs) {
    const pkg = loadPackage(job.name, job.file);
    if (!job.check(pkg)) {
      console.error(
        `[patch-embedpdf-plugins] check failed for ${job.name}@${EXPECTED_VERSION}. ` +
          "Run `npm install` (or `npm run postinstall`) to apply the local plugin patch.",
      );
      failed = true;
    } else {
      console.log(
        `[patch-embedpdf-plugins] check passed for ${job.name}@${EXPECTED_VERSION}`,
      );
    }
  }
  process.exit(failed ? 1 : 0);
}

for (const job of jobs) {
  const pkg = loadPackage(job.name, job.file);
  const patched = job.apply(pkg);
  if (patched !== pkg.source) {
    writeFileSync(pkg.target, patched);
    console.log(
      `[patch-embedpdf-plugins] applied local patches to ${job.name}@${EXPECTED_VERSION}`,
    );
  } else {
    console.log(
      `[patch-embedpdf-plugins] already applied for ${job.name}@${EXPECTED_VERSION}`,
    );
  }
}
