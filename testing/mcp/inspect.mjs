// Read-only PDF, ZIP and OOXML inspection used to judge whether an MCP result is right.
import { inflateRawSync } from "node:zlib";

import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "@cantoo/pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** pdf-lib view of a PDF, for structure (pages, rotation, sizes, outlines, forms). */
export const loadPdf = (bytes) => PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });

/** Whitespace-normalised text per page via pdf.js; throws PasswordException when locked. */
export async function pageTexts(bytes, password) {
  const task = getDocument({ data: new Uint8Array(bytes), password, verbosity: 0, isEvalSupported: false, disableFontFace: true });
  const doc = await task.promise;
  try {
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      out.push(content.items.map((it) => it.str ?? "").join(" ").replace(/\s+/g, " ").trim());
    }
    return out;
  } finally {
    await task.destroy();
  }
}

export const allText = async (bytes, password) => (await pageTexts(bytes, password)).join("\n");

/** Opens with pdf.js and reports {opened, error} without throwing. */
export async function tryOpen(bytes, password) {
  try {
    const pages = await pageTexts(bytes, password);
    return { opened: true, pages };
  } catch (e) {
    return { opened: false, error: e?.name ?? String(e) };
  }
}

/** Every non-image stream decoded to latin1, plus the raw file, for "is it really gone" scans. */
export async function rawContentStrings(bytes) {
  const doc = await loadPdf(bytes);
  const out = [Buffer.from(bytes).toString("latin1")];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") continue;
    try {
      out.push(Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1"));
    } catch {
      // Filters pdf-lib cannot decode (e.g. DCT) are images or fonts, not text operators.
    }
  }
  return out;
}

/** Literal, hex (either case) and UTF-16BE hex forms a token can take inside a content stream. */
export function tokenForms(token) {
  const hex = Buffer.from(token, "latin1").toString("hex");
  const utf16 = Buffer.from(token, "utf16le").swap16().toString("hex");
  return [token, hex.toUpperCase(), hex.toLowerCase(), utf16.toUpperCase(), utf16.toLowerCase()];
}

/** Rotation, size and text of each page. */
export async function pageSummary(bytes) {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((p) => ({ rotate: p.getRotation().angle, ...p.getSize() }));
}

/** Top-level outline titles in order. */
export async function outlineTitles(bytes) {
  const doc = await loadPdf(bytes);
  const outlines = doc.catalog.lookup(PDFName.of("Outlines"));
  const titles = [];
  let item = outlines?.lookup(PDFName.of("First"));
  for (let guard = 0; item && guard < 1000; guard++) {
    titles.push(item.lookup(PDFName.of("Title"))?.decodeText?.() ?? "");
    item = item.lookup(PDFName.of("Next"));
  }
  return titles;
}

/** Names of AcroForm fields still present. */
export async function formFieldNames(bytes) {
  const doc = await loadPdf(bytes);
  try {
    return doc.getForm().getFields().map((f) => f.getName());
  } catch {
    return [];
  }
}

/** Whether the trailer carries an /Encrypt dictionary. */
export async function isEncrypted(bytes) {
  return (await loadPdf(bytes)).isEncrypted;
}

/** Minimal ZIP reader (central directory, stored + deflate) returning name -> Buffer. */
export function unzip(bytes) {
  const buf = Buffer.from(bytes);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a ZIP (no end of central directory)");
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("bad central directory entry");
    const method = buf.readUInt16LE(ptr + 10);
    const compressed = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const local = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + compressed);
    files.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Plain text of every XML part matching a prefix, tags stripped and entities decoded. */
export function xmlText(files, prefix) {
  const parts = [];
  for (const [name, data] of files) {
    if (name.startsWith(prefix) && name.endsWith(".xml")) parts.push(data.toString("utf8"));
  }
  return parts
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** Lower-case alphanumerics only, so OCR spacing and punctuation slips do not matter. */
export const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
