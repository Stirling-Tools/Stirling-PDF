import { invoke } from "@tauri-apps/api/core";
import { generateId } from "@app/utils/generateId";

function sanitizeFileName(fileName: string) {
  const cleaned = fileName.replace(/[^A-Za-z0-9._-]+/g, "_");
  if (!cleaned.toLowerCase().endsWith(".pdf")) {
    return `${cleaned || "document"}.pdf`;
  }
  return cleaned || "document.pdf";
}

/** The array buffer that produced the temporary file is not kept. */
export async function printPdfNatively(
  source: Blob,
  fileName = "document.pdf",
) {
  const { tempDir, join } = await import("@tauri-apps/api/path");
  const { remove, writeFile } = await import("@tauri-apps/plugin-fs");

  const tempPath = await join(
    await tempDir(),
    `stirling-print-${generateId()}-${sanitizeFileName(fileName)}`,
  );

  try {
    await writeFile(tempPath, new Uint8Array(await source.arrayBuffer()));

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
