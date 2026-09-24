import { invoke, isTauri } from "@tauri-apps/api/core";

// Shadow of the core no-op; @app alias order gives desktop builds this one.
export { NATIVE_THUMBNAIL_WIDTH } from "@core/services/nativePdfRender";

export const canRenderNativeThumbnails = true;

export async function renderNativeThumbnail(
  path: string,
  page: number,
  maxWidth: number,
): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const bytes = await invoke<ArrayBuffer>("render_pdf_page_thumbnail", {
      path,
      page,
      maxWidth,
    });
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) return null;
    return `data:image/jpeg;base64,${toBase64(bytes)}`;
  } catch (error) {
    console.warn("[nativePdfRender] native render failed:", path, error);
    return null;
  }
}

// One 8 KiB slice per call keeps the spread argument list within engine limits
// for multi-MB rasters.
const BASE64_CHUNK = 0x2000;

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(
      ...view.subarray(offset, offset + BASE64_CHUNK),
    );
  }
  return btoa(binary);
}
