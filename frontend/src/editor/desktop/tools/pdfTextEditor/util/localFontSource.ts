import { invoke } from "@tauri-apps/api/core";
import type { LocalFontPermission } from "@editor-core/tools/pdfTextEditor/util/localFontSource";
import type { LocalFont } from "@editor/tools/pdfTextEditor/util/localFonts";

export type { LocalFontPermission };

interface SystemFontFace extends LocalFont {
  id: number;
}

const idOf = new WeakMap<LocalFont, number>();

export function hasDeviceFontSource(): boolean {
  return true;
}

// list_system_fonts already drops faces that are not TrueType or whose licence forbids embedding.
export async function listDeviceFaces(): Promise<LocalFont[]> {
  const faces = await invoke<SystemFontFace[]>("list_system_fonts");
  return faces.map(({ id, ...font }) => {
    idOf.set(font, id);
    return font;
  });
}

export async function readDeviceFace(
  face: LocalFont,
): Promise<Uint8Array | null> {
  const id = idOf.get(face);
  if (id === undefined) return null;
  try {
    const file = await invoke<ArrayBuffer>("read_system_font", { id });
    return file.byteLength > 0 ? new Uint8Array(file) : null;
  } catch {
    return null;
  }
}

export async function localFontPermission(): Promise<LocalFontPermission> {
  return "granted";
}

export function watchLocalFontPermission(
  _listener: (permission: LocalFontPermission) => void,
): () => void {
  return () => {};
}
