#!/usr/bin/env node
// Local patch for the pinned @embedpdf/engines: the worker copies render bitmaps
// and re-fetches pdfium.wasm even when the main thread holds a compiled module
// (embedpdf/embed-pdf-viewer#105). Version-anchored and fail-loud; delete once
// the engine ships transfers and module handoff.
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_VERSION = "2.15.0";
const MARKER = "STIRLING_LOCAL_EMBEDPDF_PATCH";
const checkOnly = process.argv.includes("--check");
const enginesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../node_modules/@embedpdf/engines",
);
const packageJsonPath = path.join(enginesDir, "package.json");
const target = path.join(enginesDir, "dist/lib/pdfium/web/worker-engine.js");
const distDir = path.join(enginesDir, "dist");

if (!existsSync(target) || !existsSync(packageJsonPath)) {
  console.error(
    "[patch-embedpdf-engines] @embedpdf/engines is not installed; cannot verify the local patches",
  );
  process.exit(checkOnly ? 1 : 0);
}

const installedVersion = JSON.parse(
  readFileSync(packageJsonPath, "utf8"),
).version;
if (installedVersion !== EXPECTED_VERSION) {
  console.error(
    `[patch-embedpdf-engines] expected @embedpdf/engines@${EXPECTED_VERSION}, found ${installedVersion}. ` +
      "Re-verify every patch anchor against the new version before updating EXPECTED_VERSION.",
  );
  process.exit(1);
}

let source = readFileSync(target, "utf8");

// The orchestrator class lives in a hashed chunk; the probe method goes there.
const engineChunkFile = readdirSync(distDir).find((name) =>
  /^pdf-engine-.*\.js$/.test(name),
);
if (!engineChunkFile) {
  console.error(
    "[patch-embedpdf-engines] orchestrator chunk (pdf-engine-*.js) not found",
  );
  process.exit(1);
}
const engineChunkPath = path.join(distDir, engineChunkFile);
let engineChunkSource = readFileSync(engineChunkPath, "utf8");

// Text inside the embedded worker bundle is stored with `\n` escape sequences, so
// patterns that span lines use a literal backslash-n. Patterns outside it use real
// newlines. Every anchor is asserted: a silent miss would ship an unpatched engine.
const replacements = [
  {
    label: "worker: accept precompiled module in wasmInit",
    find: 'type === "wasmInit" && wasmUrl && !runner',
    replace: `type === "wasmInit" && (wasmUrl || event.data.wasmModule) && !runner /* ${MARKER} */`,
  },
  {
    label: "worker: use module bytes or fetch",
    find: "const response = await fetch(wasmUrl);\\n      const wasmBinary = await response.arrayBuffer();",
    replace:
      "let wasmBinary = event.data.wasmModule;\\n      if (!wasmBinary) {\\n        const response = await fetch(wasmUrl);\\n        wasmBinary = await response.arrayBuffer();\\n      }",
  },
  {
    label: "worker: instantiate precompiled module without recompiling",
    find: "async prepare() {\\n    const wasmBinary = this.wasmBinary;\\n    const wasmModule = await init({ wasmBinary });",
    replace:
      'async prepare() {\\n    const wasmBinary = this.wasmBinary;\\n    const isPrecompiled = typeof WebAssembly === "object" && WebAssembly.Module && wasmBinary instanceof WebAssembly.Module;\\n    const wasmModule = isPrecompiled ? await init({\\n      instantiateWasm: (imports, successCallback) => {\\n        const instance = new WebAssembly.Instance(wasmBinary, imports);\\n        successCallback(instance, wasmBinary);\\n        return instance.exports;\\n      }\\n    }) : await init({ wasmBinary });',
  },
  {
    label: "worker: transfer whole-buffer render results",
    find: 'respond(response) {\\n    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "Sending response:", response.type);\\n    self.postMessage(response);\\n  }',
    replace:
      'respond(response) {\\n    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "Sending response:", response.type);\\n    const imagePayload = response && response.data;\\n    const imageData = imagePayload && imagePayload.data;\\n    // Below 64 KB a transfer costs more than the copy it avoids; tile renders that matter are MB scale.\\n    if (imageData && typeof imagePayload.width === "number" && typeof imagePayload.height === "number" && imageData.byteLength >= 65536) {\\n      const imageBuffer = imageData.buffer;\\n      if (imageBuffer instanceof ArrayBuffer && imageData.byteOffset === 0 && imageData.byteLength === imageBuffer.byteLength) {\\n        self.postMessage(response, [imageBuffer]);\\n        return;\\n      }\\n    }\\n    self.postMessage(response);\\n  }',
  },
  {
    label: "engine: read wasmModule option",
    find: /const \{ logger, encoderPoolSize, fontFallback(, wasmModule: precompiledWasmModule)? \} = config;/,
    replace:
      "const { logger, encoderPoolSize, fontFallback, wasmModule: precompiledWasmModule } = config;",
  },
  {
    label: "engine: pass wasmModule to the executor",
    find: /const remoteExecutor = new RemoteExecutor\(worker, \{ wasmUrl, logger, fontFallback(, wasmModule: precompiledWasmModule)? \}\);/,
    replace:
      "const remoteExecutor = new RemoteExecutor(worker, { wasmUrl, logger, fontFallback, wasmModule: precompiledWasmModule });",
  },
  {
    label: "engine: post wasmModule with clone fallback",
    find: /( {4}this\.worker\.postMessage\({\n {6}id: _RemoteExecutor\.READY_TASK_ID,\n {6}type: "wasmInit",\n {6}wasmUrl: options\.wasmUrl,\n {6}logger: options\.logger \? serializeLogger\(options\.logger\) : void 0,\n {6}fontFallback: options\.fontFallback\n {4}}\);| {4}const wasmInitMessage = {\n {6}id: _RemoteExecutor\.READY_TASK_ID,\n {6}type: "wasmInit",\n {6}wasmUrl: options\.wasmUrl,\n {6}logger: options\.logger \? serializeLogger\(options\.logger\) : void 0,\n {6}fontFallback: options\.fontFallback\n {4}};\n{4}\/\/ WebAssembly\.Module is structured-cloneable in Chromium\/Firefox but not\n {4}\/\/ WebKit; when cloning fails the worker fetches the URL itself\.\n {4}if \(options\.wasmModule\) wasmInitMessage\.wasmModule = options\.wasmModule;\n {4}try {\n {6}this\.worker\.postMessage\(wasmInitMessage\);\n {4}} catch \(cloneError\) {\n {6}if \(!wasmInitMessage\.wasmModule\) throw cloneError;\n {6}delete wasmInitMessage\.wasmModule;\n {6}this\.worker\.postMessage\(wasmInitMessage\);\n {4}})/,
    replace: `    const wasmInitMessage = {
      id: _RemoteExecutor.READY_TASK_ID,
      type: "wasmInit",
      wasmUrl: options.wasmUrl,
      logger: options.logger ? serializeLogger(options.logger) : void 0,
      fontFallback: options.fontFallback
    };
    // Cloning a module can throw DataCloneError (W3C wasm-web-api agent-cluster
    // restriction); the worker then fetches the URL itself.
    if (options.wasmModule) wasmInitMessage.wasmModule = options.wasmModule;
    try {
      this.worker.postMessage(wasmInitMessage);
    } catch (cloneError) {
      if (!wasmInitMessage.wasmModule) throw cloneError;
      delete wasmInitMessage.wasmModule;
      this.worker.postMessage(wasmInitMessage);
    }`,
  },
  {
    label: "engine: capture worker blob URLs",
    find: / {2}const \{ logger, encoderPoolSize, fontFallback, wasmModule: precompiledWasmModule \} = config;\n( {2}const __stirlingCreatedUrls = \[\];\n {2}const __stirlingCreateObjectURL = URL\.createObjectURL\.bind\(URL\);\n {2}URL\.createObjectURL = \(obj\) => \{\n {4}const url = __stirlingCreateObjectURL\(obj\);\n {4}__stirlingCreatedUrls\.push\(url\);\n {4}return url;\n {2}\};\n)? {2}const worker = new Worker\(/,
    replace: `  const { logger, encoderPoolSize, fontFallback, wasmModule: precompiledWasmModule } = config;
  const __stirlingCreatedUrls = [];
  const __stirlingCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const url = __stirlingCreateObjectURL(obj);
    __stirlingCreatedUrls.push(url);
    return url;
  };
  const worker = new Worker(`,
  },
  {
    label: "engine: revoke worker blob URLs after construction",
    find: `  return new PdfEngine(remoteExecutor, {
    imageConverter: createHybridImageConverter(encoderPool),
    logger
  });
}
export {
  createPdfiumEngine
};`,
    replace: `  let __stirlingEngine;
  try {
    __stirlingEngine = new PdfEngine(remoteExecutor, {
      imageConverter: createHybridImageConverter(encoderPool),
      logger
    });
  } finally {
    URL.createObjectURL = __stirlingCreateObjectURL;
  }
  // Worker scripts are Blob URLs this build never revokes (embedpdf/embed-pdf-viewer#628),
  // so every engine (re)creation leaked one per worker. Revoke once the worker has
  // answered: revoking before it loads its script breaks the worker.
  const __stirlingRevokeWorkerUrls = () => {
    for (const __stirlingUrl of __stirlingCreatedUrls) {
      URL.revokeObjectURL(__stirlingUrl);
    }
    __stirlingCreatedUrls.length = 0;
  };
  worker.addEventListener("message", __stirlingRevokeWorkerUrls, { once: true });
  return __stirlingEngine;
}
export {
  createPdfiumEngine
};`,
  },
  {
    // One bitmap buffer per worker, grown in place. Every render path frees its
    // pixel buffer right after copying the pixels out, so the next render can
    // take the same block instead of asking the allocator for megabytes again.
    label: "worker: pool the render bitmap buffer",
    find: "function buildUserToDeviceMatrix(rect, rotation, outW, outH) {",
    // The worker source is stored as an escaped string, so newlines stay as
    // literal backslash-n and the injected block remains inside that string.
    replace: [
      "const __stirlingScratchStats = { renders: 0, allocs: 0, reuses: 0, bytes: 0 };",
      "let __stirlingBitmapPtr = 0;",
      "let __stirlingBitmapBytes = 0;",
      "function __stirlingScratchBitmap(manager, bytes) {",
      "  __stirlingScratchStats.renders += 1;",
      "  if (__stirlingBitmapPtr && __stirlingBitmapBytes >= bytes) {",
      "    __stirlingScratchStats.reuses += 1;",
      "    return __stirlingBitmapPtr;",
      "  }",
      "  if (__stirlingBitmapPtr) manager.free(__stirlingBitmapPtr);",
      "  __stirlingBitmapPtr = manager.malloc(bytes);",
      "  __stirlingBitmapBytes = __stirlingBitmapPtr ? bytes : 0;",
      "  if (__stirlingBitmapPtr) {",
      "    __stirlingScratchStats.allocs += 1;",
      "    if (bytes > __stirlingScratchStats.bytes) __stirlingScratchStats.bytes = bytes;",
      "  }",
      "  return __stirlingBitmapPtr;",
      "}",
      "globalThis.__stirlingScratchStats = __stirlingScratchStats;",
      "function buildUserToDeviceMatrix(rect, rotation, outW, outH) {",
    ].join("\\n"),
  },
  {
    label: "worker: take the render bitmap from the pool",
    find: /const heapPtr = this\.memoryManager\.malloc\(bytes\);/g,
    replace:
      "const heapPtr = __stirlingScratchBitmap(this.memoryManager, bytes);",
  },
  {
    label: "worker: return the render bitmap to the pool",
    find: /this\.memoryManager\.free\(heapPtr\);/g,
    replace: "/* bitmap kept for reuse by __stirlingScratchBitmap */",
  },
  {
    // The worker copied every document into the WASM heap, a second full copy
    // on top of the cloned buffer it already owns. FPDF_FILEACCESS lets PDFium
    // read 64 KB blocks from that buffer instead, so the heap holds metadata
    // plus the blocks a render actually touches.
    label: "worker: file-access helpers",
    find: "const WasmPointer = (ptr) => ptr;",
    replace: [
      "const __stirlingDocAccess = new Map();",
      "function __stirlingReleaseFileAccess(pdfiumModule, filePtr) {",
      "  const access = __stirlingDocAccess.get(filePtr);",
      "  if (access) {",
      "    pdfiumModule.pdfium.removeFunction(access.getBlockPtr);",
      "    __stirlingDocAccess.delete(filePtr);",
      "  }",
      "}",
      "function __stirlingHasLayers(content) {",
      "  // The catalog that names optional content is reached from the trailer, so",
      "  // the head and tail windows cover uncompressed catalogs and object streams.",
      "  const HEAD = 1048576;",
      "  const TAIL = 4194304;",
      "  const CHUNK = 65536;",
      '  const decoder = new TextDecoder("latin1");',
      '  const isBlob = typeof Blob !== "undefined" && content instanceof Blob;',
      "  const length = isBlob ? content.size : content.byteLength;",
      "  const reader = isBlob ? new FileReaderSync() : null;",
      "  const windows = length <= HEAD + TAIL ? [[0, length]] : [[0, HEAD], [length - TAIL, length]];",
      "  for (const [start, end] of windows) {",
      '    let carry = "";',
      "    for (let at = start; at < end; at += CHUNK) {",
      "      const stop = Math.min(at + CHUNK, end);",
      "      const bytes = reader",
      "        ? new Uint8Array(reader.readAsArrayBuffer(content.slice(at, stop)))",
      "        : new Uint8Array(content, at, stop - at);",
      "      const text = carry + decoder.decode(bytes);",
      "      if (/\\\\/OCProperties(?![A-Za-z0-9])/.test(text)) return true;",
      "      carry = text.slice(-16);",
      "    }",
      "  }",
      "  return false;",
      "}",
      "const WasmPointer = (ptr) => ptr;",
    ].join("\\n"),
  },
  {
    label: "worker: serve the document from the JS bytes",
    find: /(const isBlob = typeof Blob !== [^;]+;[^\n]*?const docPtr = this\.pdfiumModule\.FPDF_LoadCustomDocument\(filePtr, \(options == null \? void 0 : options\.password\) \?\? ""\);|const array = new Uint8Array\(file\.content\);\\n {4}const length = array\.length;\\n {4}const filePtr = this\.memoryManager\.malloc\(length\);\\n {4}this\.pdfiumModule\.pdfium\.HEAPU8\.set\(array, filePtr\);\\n {4}const docPtr = this\.pdfiumModule\.FPDF_LoadMemDocument\(filePtr, length, \(options == null \? void 0 : options\.password\) \?\? ""\);|const array = new Uint8Array\(file\.content\);[^\n]*?const docPtr = this\.pdfiumModule\.FPDF_LoadCustomDocument\(filePtr, \(options == null \? void 0 : options\.password\) \?\? ""\);)/,
    replace: [
      'const isBlob = typeof Blob !== "undefined" && file.content instanceof Blob;',
      "    const length = isBlob ? file.content.size : file.content.byteLength;",
      "    const array = isBlob ? null : new Uint8Array(file.content);",
      "    const reader = isBlob ? new FileReaderSync() : null;",
      "    const blockCache = isBlob ? new Map() : null;",
      "    const CACHE_MAX = 32;",
      "    const BLOCK_SIZE = 65536; // 64 KB blocks cap the cache at 2 MB: a page object graph stays resident without pinning the file",
      "    const runtime = this.pdfiumModule.pdfium;",
      "    let filePtr;",
      "    let docPtr;",
      "    globalThis.__stirlingWorkerHeapBytes = () => this.pdfiumModule.pdfium.wasmExports.memory.buffer.byteLength;",
      '    if (typeof runtime.addFunction === "function" && typeof runtime.removeFunction === "function" && typeof runtime.setValue === "function") {',
      "      filePtr = this.memoryManager.malloc(12);",
      "        const getBlockPtr = runtime.addFunction((param, position, bufferPtr, size) => {",
      "        const end = position + size;",
      "        if (position < 0 || end > length) return 0;",
      "        if (isBlob) {",
      "          if (size <= BLOCK_SIZE) {",
      "            const blockIndex = Math.floor(position / BLOCK_SIZE);",
      "            const blockStart = blockIndex * BLOCK_SIZE;",
      "            let cached = blockCache.get(blockIndex);",
      "            if (!cached) {",
      "              const blockEnd = Math.min(blockStart + BLOCK_SIZE, length);",
      "              const chunk = reader.readAsArrayBuffer(file.content.slice(blockStart, blockEnd));",
      "              cached = new Uint8Array(chunk);",
      "              if (blockCache.size >= CACHE_MAX) {",
      "                const firstKey = blockCache.keys().next().value;",
      "                blockCache.delete(firstKey);",
      "              }",
      "              blockCache.set(blockIndex, cached);",
      "            }",
      "            const offsetInBlock = position - blockStart;",
      "            if (offsetInBlock + size <= cached.length) {",
      "              this.pdfiumModule.pdfium.HEAPU8.set(cached.subarray(offsetInBlock, offsetInBlock + size), bufferPtr);",
      "              return 1;",
      "            }",
      "          }",
      "          const directChunk = reader.readAsArrayBuffer(file.content.slice(position, end));",
      "          this.pdfiumModule.pdfium.HEAPU8.set(new Uint8Array(directChunk), bufferPtr);",
      "        } else {",
      "          this.pdfiumModule.pdfium.HEAPU8.set(array.subarray(position, end), bufferPtr);",
      "        }",
      "        return 1;",
      '      }, "iiiii"); // int return plus param/position/bufferPtr/size, the FPDF_FILEACCESS GetBlock shape',
      '      runtime.setValue(filePtr, length, "i32");',
      '      runtime.setValue(filePtr + 4, getBlockPtr, "i32");',
      '      runtime.setValue(filePtr + 8, 0, "i32");',
      "      __stirlingDocAccess.set(filePtr, { getBlockPtr, content: file.content });",
      "      globalThis.__stirlingWorkerDocBytes = 0;",
      '      docPtr = this.pdfiumModule.FPDF_LoadCustomDocument(filePtr, (options == null ? void 0 : options.password) ?? "");',
      "    } else {",
      "      const bytes = isBlob ? new Uint8Array(reader.readAsArrayBuffer(file.content)) : array;",
      "      filePtr = this.memoryManager.malloc(length);",
      "      runtime.HEAPU8.set(bytes, filePtr);",
      "      globalThis.__stirlingWorkerDocBytes = length;",
      '      docPtr = this.pdfiumModule.FPDF_LoadMemDocument(filePtr, length, (options == null ? void 0 : options.password) ?? "");',
      "    }",
    ].join("\\n"),
  },
  {
    label: "worker: answer the form and layer probes",
    find: '\\n  openDocumentBuffer(file, options) {\\n    this.logger.debug(LOG_SOURCE$1, LOG_CATEGORY$1, "openDocumentBuffer", file, options);',
    replace: [
      "",
      "  getDocumentProbe(id) {",
      "    const ctx = this.cache.docs.get(id);",
      "    if (!ctx) {",
      "      throw new Error(`Document ${id} is not open`);",
      "    }",
      "    const access = __stirlingDocAccess.get(ctx.filePtr);",
      "    const formType = this.pdfiumModule.FPDF_GetFormType(ctx.docPtr);",
      "    return {",
      "      formType,",
      "      attachmentCount: this.pdfiumModule.FPDFDoc_GetAttachmentCount(ctx.docPtr),",
      "      hasLayers: access && access.content ? __stirlingHasLayers(access.content) : null",
      "    };",
      "  }",
      "",
      "  openDocumentBuffer(file, options) {",
      '    this.logger.debug(LOG_SOURCE$1, LOG_CATEGORY$1, "openDocumentBuffer", file, options);',
    ].join("\\n"),
  },
  {
    label: "engine: send the document probe to the worker",
    find: '  getDocPermissions(doc) {\n    return this.send("getDocPermissions", [doc]);\n  }',
    replace:
      '  getDocumentProbe(id) {\n    return this.send("getDocumentProbe", [id]);\n  }\n  getDocPermissions(doc) {\n    return this.send("getDocPermissions", [doc]);\n  }',
  },
  {
    label: "worker: release file access when the open fails",
    find: "this.logger.error(LOG_SOURCE$1, LOG_CATEGORY$1, `FPDF_LoadMemDocument failed with ${lastError}`);\\n      this.memoryManager.free(filePtr);",
    replace:
      "this.logger.error(LOG_SOURCE$1, LOG_CATEGORY$1, `FPDF_LoadMemDocument failed with ${lastError}`);\\n      __stirlingReleaseFileAccess(this.pdfiumModule, filePtr);\\n      this.memoryManager.free(filePtr);",
  },
  {
    label: "worker: release file access when the page probe fails",
    find: "this.pdfiumModule.FPDF_CloseDocument(docPtr);\\n        this.memoryManager.free(filePtr);",
    replace:
      "this.pdfiumModule.FPDF_CloseDocument(docPtr);\\n        __stirlingReleaseFileAccess(this.pdfiumModule, filePtr);\\n        this.memoryManager.free(filePtr);",
  },
  {
    label: "worker: release file access on dispose",
    find: "this.pageCache.pdf.FPDF_CloseDocument(this.docPtr);\\n    this.memoryManager.free(WasmPointer(this.filePtr));",
    replace:
      "this.pageCache.pdf.FPDF_CloseDocument(this.docPtr);\\n    __stirlingReleaseFileAccess(this.pageCache.pdf, this.filePtr);\\n    this.memoryManager.free(WasmPointer(this.filePtr));",
  },
];

// The orchestrator class enqueues to the worker queue; the probe goes there too.
const chunkReplacements = [
  {
    label: "engine chunk: expose the document probe",
    find: "  openDocumentBuffer(file, options) {\n    return this.workerQueue.enqueue(",
    replace: [
      "  getDocumentProbe(id) {",
      "    return this.workerQueue.enqueue(",
      "      {",
      "        execute: () => this.executor.getDocumentProbe(id),",
      '        meta: { docId: id, operation: "getDocumentProbe" }',
      "      },",
      "      { priority: Priority.LOW }",
      "    );",
      "  }",
      "  openDocumentBuffer(file, options) {",
      "    return this.workerQueue.enqueue(",
    ].join("\n"),
  },
];

if (checkOnly) {
  const missing = [
    ...replacements.filter(({ replace }) => !source.includes(replace)),
    ...chunkReplacements.filter(
      ({ replace }) => !engineChunkSource.includes(replace),
    ),
  ];
  if (missing.length > 0) {
    console.error(
      `[patch-embedpdf-engines] check failed: ${missing.length} patch(es) missing: ` +
        `${missing.map(({ label }) => label).join(", ")}. ` +
        "Run `npm install` (or `npm run postinstall`) to apply the local engine patch.",
    );
    process.exit(1);
  }
  console.log(
    `[patch-embedpdf-engines] check passed for @embedpdf/engines@${installedVersion}`,
  );
  process.exit(0);
}

for (const { label, find, replace } of replacements) {
  if (source.includes(replace)) {
    continue;
  }
  const match =
    typeof find === "string" ? source.includes(find) : find.test(source);
  if (!match) {
    console.error(
      `[patch-embedpdf-engines] anchor not found for "${label}" in @embedpdf/engines@${installedVersion}. ` +
        "The patch must be re-verified against this version.",
    );
    process.exit(1);
  }
  source = source.replace(find, () => replace);
}

const workerBlob = source.match(/new Blob\(\['((?:[^'\\]|\\.)*)'\]/);
if (!workerBlob) {
  console.error(
    "[patch-embedpdf-engines] worker blob literal not found; cannot verify the patched worker source",
  );
  process.exit(1);
}
const unescapeWorker = (raw) => {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== "\\") {
      out += raw[i];
      continue;
    }
    const next = raw[i + 1];
    out +=
      next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : next;
    i += 1;
  }
  return out;
};
// Parse-only check through a temp module: the anchors cannot see an eaten
// backslash, and the worker uses import.meta, so new Function cannot parse it.
const checkDir = mkdtempSync(path.join(tmpdir(), "stirling-worker-check-"));
const checkPath = path.join(checkDir, "worker.mjs");
writeFileSync(checkPath, unescapeWorker(workerBlob[1]));
const parsed = spawnSync(process.execPath, ["--check", checkPath], {
  encoding: "utf8",
});
rmSync(checkDir, { recursive: true, force: true });
if (parsed.status !== 0) {
  const reason = (parsed.stderr || "unknown parse error").split("\n")[0];
  console.error(
    `[patch-embedpdf-engines] patched worker source does not parse: ${reason}`,
  );
  process.exit(1);
}

writeFileSync(target, source);

for (const { label, find, replace } of chunkReplacements) {
  if (engineChunkSource.includes(replace)) continue;
  if (!engineChunkSource.includes(find)) {
    console.error(
      `[patch-embedpdf-engines] anchor not found for "${label}" in ${engineChunkFile}. ` +
        "The patch must be re-verified against this version.",
    );
    process.exit(1);
  }
  engineChunkSource = engineChunkSource.replace(find, () => replace);
}
writeFileSync(engineChunkPath, engineChunkSource);

console.log(
  `[patch-embedpdf-engines] applied local patches to @embedpdf/engines@${installedVersion}`,
);
