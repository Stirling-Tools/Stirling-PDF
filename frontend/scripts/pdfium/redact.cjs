#!/usr/bin/env node
/* eslint-env node */
/**
 * PDFium-based redaction helper.
 *
 * Expected CLI usage:
 *   node scripts/pdfium/redact.cjs --config /path/to/config.json
 *
 * The config file should include:
 * {
 *   "inputPath": "/tmp/input.pdf",
 *   "outputPath": "/tmp/output.pdf",
 *   "wasmPath": "/abs/path/to/pdfium.wasm",
 *   "originalName": "document.pdf",
 *   "drawBlackBoxes": false,
 *   "operations": [
 *     {
 *       "pageIndex": 0,
 *       "rects": [
 *         { "origin": { "x": 10, "y": 20 }, "size": { "width": 100, "height": 15 } }
 *       ]
 *     }
 *   ]
 * }
 */
const fs = require('fs');
const path = require('path');

const { init } = require('@embedpdf/pdfium');
const { PdfiumEngine } = require('@embedpdf/engines/pdfium');

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function normalizeRect(rect) {
  if (!rect || !rect.origin || !rect.size) {
    return null;
  }

  const x = Number(rect.origin.x);
  const y = Number(rect.origin.y);
  const width = Number(rect.size.width);
  const height = Number(rect.size.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0.01 ||
    height <= 0.01
  ) {
    return null;
  }

  return {
    origin: { x, y },
    size: { width, height },
  };
}

function parseArguments() {
  const args = process.argv.slice(2);
  let configPath = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      break;
    }
    if (arg.startsWith('--config=')) {
      configPath = arg.substring('--config='.length);
      break;
    }
  }

  if (!configPath) {
    throw new Error('Missing --config argument');
  }

  return path.resolve(configPath);
}

async function loadConfig(configPath) {
  const raw = await fs.promises.readFile(configPath, 'utf-8');
  const config = JSON.parse(raw);
  if (!config.inputPath || !config.outputPath || !config.operations) {
    throw new Error('Invalid configuration: missing inputPath/outputPath/operations');
  }
  return config;
}

async function createEngine(config) {
  const wasmBinary = await fs.promises.readFile(config.wasmPath);
  const pdfium = await init({ wasmBinary: toArrayBuffer(wasmBinary) });
  if (typeof pdfium.PDFiumExt_Init === 'function') {
    pdfium.PDFiumExt_Init();
  }
  const engine = new PdfiumEngine(pdfium);
  await engine.initialize().toPromise();
  return { engine, pdfium };
}

async function openDocument(engine, config, inputBytes) {
  const file = {
    id: 'stirling-redact',
    name: config.originalName || 'document.pdf',
    content: toArrayBuffer(inputBytes),
  };
  return engine.openDocumentBuffer(file).toPromise();
}

async function applyRedactions(engine, doc, operations, drawBlackBoxes) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return;
  }

  for (const operation of operations) {
    if (
      !operation ||
      typeof operation.pageIndex !== 'number' ||
      !Array.isArray(operation.rects) ||
      !doc.pages ||
      !doc.pages[operation.pageIndex]
    ) {
      continue;
    }

    const rects = operation.rects
      .map(normalizeRect)
      .filter(Boolean);

    if (rects.length === 0) {
      continue;
    }

    await engine
      .redactTextInRects(doc, doc.pages[operation.pageIndex], rects, {
        drawBlackBoxes: Boolean(drawBlackBoxes),
      })
      .toPromise();
  }
}

async function saveDocument(engine, doc, outputPath) {
  const arrayBuffer = await engine.saveAsCopy(doc).toPromise();
  if (!arrayBuffer || typeof arrayBuffer.byteLength !== 'number' || arrayBuffer.byteLength === 0) {
    throw new Error('PDFium save resulted in 0 bytes');
  }
  const buffer = Buffer.from(new Uint8Array(arrayBuffer));
  await fs.promises.writeFile(outputPath, buffer);
}

async function main() {
  const configPath = parseArguments();
  const config = await loadConfig(configPath);
  if (!fs.existsSync(config.inputPath)) {
    throw new Error(`Input file not found: ${config.inputPath}`);
  }
  const inputBytes = await fs.promises.readFile(config.inputPath);

  let context = null;

  try {
    context = await createEngine(config);
    const doc = await openDocument(context.engine, config, inputBytes);

    try {
      await applyRedactions(context.engine, doc, config.operations, config.drawBlackBoxes);
      await saveDocument(context.engine, doc, config.outputPath);
    } finally {
      if (doc) {
        await context.engine
          .closeDocument(doc)
          .toPromise()
          .catch((e) => console.warn('[pdfium-redact] Close document warning:', e));
      }
    }
  } catch (err) {
    console.error('INTERNAL_PDFIUM_ERROR:', err);
    throw err;
  } finally {
    if (context && context.engine) {
      await context.engine
        .destroy()
        .toPromise()
        .catch(() => undefined);
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[pdfium-redact] Failed:', error && error.stack ? error.stack : error);
    process.exit(1);
  });

