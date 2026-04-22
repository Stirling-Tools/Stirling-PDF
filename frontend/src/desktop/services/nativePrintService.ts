import { invoke } from "@tauri-apps/api/core";

function sanitizeFileName(fileName: string) {
  const cleaned = fileName.replace(/[^A-Za-z0-9._-]+/g, "_");
  if (!cleaned.toLowerCase().endsWith(".pdf")) {
    return `${cleaned || "document"}.pdf`;
  }
  return cleaned || "document.pdf";
}

async function resolvePdfSource(file?: File | Blob, url?: string | null) {
  if (file) {
    return file;
  }

  if (!url) {
    return null;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load PDF for native print (${response.status})`);
  }

  return response.blob();
}

export async function printPdfNatively(
  file?: File | Blob,
  url?: string | null,
  fileName = "document.pdf",
) {
  const source = await resolvePdfSource(file, url);
  if (!source) {
    throw new Error("No PDF source available for native print");
  }

  const { tempDir, join } = await import("@tauri-apps/api/path");
  const { remove, writeFile } = await import("@tauri-apps/plugin-fs");

  const tempPath = await join(
    await tempDir(),
    `stirling-print-${crypto.randomUUID()}-${sanitizeFileName(fileName)}`,
  );

  await writeFile(tempPath, new Uint8Array(await source.arrayBuffer()));

  try {
    await invoke("print_pdf_file_native", {
      filePath: tempPath,
      title: fileName,
    });
  } finally {
    try {
      await remove(tempPath);
    } catch (error) {
      console.warn("[Desktop Print] Failed to clean up temp print file", error);
    }
  }
}
