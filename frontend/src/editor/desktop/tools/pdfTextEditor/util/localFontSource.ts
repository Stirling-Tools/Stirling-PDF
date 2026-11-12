import { invoke } from "@tauri-apps/api/core";
import type {
  LocalFontPermission,
  QueryLocalFonts,
} from "@editor-core/tools/pdfTextEditor/util/localFontSource";

export type { LocalFontPermission, QueryLocalFonts };

interface SystemFontFace {
  id: number;
  family: string;
  fullName: string;
  style: string;
  postscriptName: string;
}

async function querySystemFonts(): Promise<unknown[]> {
  const faces = await invoke<SystemFontFace[]>("list_system_fonts");
  return faces.map((face) => ({
    ...face,
    blob: async () => ({
      arrayBuffer: () =>
        invoke<ArrayBuffer>("read_system_font", { id: face.id }),
    }),
  }));
}

/**
 * Desktop shadow: the OS webviews have no Local Font Access API, so the native
 * side enumerates the installed fonts. It lists only faces whose licence allows
 * embedding, and needs no permission prompt.
 */
export function localFontQuery(): QueryLocalFonts | null {
  return querySystemFonts;
}

export async function localFontPermission(): Promise<LocalFontPermission> {
  return "granted";
}

export function watchLocalFontPermission(
  _listener: (permission: LocalFontPermission) => void,
): () => void {
  return () => {};
}
