// Picking and decoding a replacement image. The toolbar renders in the
// workbench, a different React tree from the panel owning the file inputs.
import type { DecodedImage } from "@app/utils/pdfiumBitmapUtils";

export interface PickedImage {
  decoded: DecodedImage;
  /** Present for JPEGs, so the embed can pass the original bytes through. */
  jpegBytes?: Uint8Array;
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    let settled = false;
    const done = (file: File | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => done(input.files?.[0] ?? null));
    // No cancel event fires in older browsers, so the dialog closing without
    // a pick simply leaves the promise pending until the next focus.
    input.addEventListener("cancel", () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

export async function decodeImageForEmbed(file: File): Promise<PickedImage> {
  const decoded = await decodeToRgba(file);
  if (file.type === "image/jpeg") {
    return {
      decoded,
      jpegBytes: new Uint8Array(await file.arrayBuffer()),
    };
  }
  return { decoded };
}

/** Decode PNG bytes that came back from an external editor. */
export async function decodeBytesForEmbed(
  bytes: Uint8Array,
  type = "image/png",
): Promise<DecodedImage> {
  return decodeToRgba(new File([bytes as BlobPart], "external", { type }));
}

function decodeToRgba(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, width, height);
        resolve({ rgba: new Uint8Array(data.data.buffer), width, height });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the selected image."));
    };
    img.src = url;
  });
}
