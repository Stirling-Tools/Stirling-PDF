// Exercises real tools against whichever backend the desktop app started.
//
// Every call here goes through the *bundled* jlink JRE running the *bundled*
// JAR, so a failure means the shipped runtime is wrong for this platform -
// a missing jlink module, a JRE older than the JAR's class-file version, or
// native libraries that were not published for this OS/arch.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const PDF_MAGIC = "%PDF-";

async function pdfPart(path) {
  const bytes = await readFile(path);
  return new File([bytes], basename(path), { type: "application/pdf" });
}

async function postForm(baseUrl, path, form) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "<unreadable body>");
    throw new Error(
      `POST ${path} returned ${response.status}: ${detail.slice(0, 800)}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

export function baseUrl(port) {
  return `http://127.0.0.1:${port}`;
}

export async function fetchStatus(port) {
  const response = await fetch(`${baseUrl(port)}/api/v1/info/status`);
  if (!response.ok) {
    throw new Error(`status endpoint returned ${response.status}`);
  }
  return response.text();
}

/**
 * Pure-PDFBox tool: proves the bundled JRE can run an ordinary server tool
 * end to end and hand back a real PDF.
 */
export async function rotatePdf(port, filePath, angle = 90) {
  const form = new FormData();
  form.set("fileInput", await pdfPart(filePath));
  form.set("angle", String(angle));
  return postForm(baseUrl(port), "/api/v1/general/rotate-pdf", form);
}

/**
 * Merge goes through `stirling.software.jpdfium.PdfMerge`, so it loads the
 * JPDFium native for this platform. Those natives are selected at build time
 * (-PjpdfiumPlatforms) and a wrong or missing one only fails at runtime -
 * exactly what a build-only CI job cannot catch.
 */
export async function mergePdfs(port, filePaths) {
  const form = new FormData();
  for (const path of filePaths) {
    form.append("fileInput", await pdfPart(path));
  }
  return postForm(baseUrl(port), "/api/v1/general/merge-pdfs", form);
}

export function assertIsPdf(bytes, what) {
  if (bytes.length < 1024) {
    throw new Error(`${what}: suspiciously small response (${bytes.length}B)`);
  }
  const header = bytes.subarray(0, PDF_MAGIC.length).toString("latin1");
  if (header !== PDF_MAGIC) {
    throw new Error(`${what}: response is not a PDF (starts with "${header}")`);
  }
}

/** Cheap page count - good enough to prove a merge actually combined inputs. */
export function countPages(bytes) {
  const matches = bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}
