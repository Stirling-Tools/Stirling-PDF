import type { DiskFileEntry } from "@app/services/localFolderContents";
import type { StirlingFileStub } from "@app/types/fileContext";

export type PickerItem =
  | { kind: "stored"; stub: StirlingFileStub }
  | { kind: "upload"; stub: StirlingFileStub; file: File }
  | { kind: "disk"; entry: DiskFileEntry };

/** Disk paths and stored IDs occupy separate namespaces in a cross-folder selection. */
export function pickerKey(item: PickerItem): string {
  return item.kind === "disk"
    ? `disk:${item.entry.path}`
    : `file:${item.stub.id}`;
}

/** Format restrictions apply equally to imports, native files and stored files. */
export function supportsPickerFile(name: string, formats?: string[]): boolean {
  if (!formats) return true;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return formats.some(
    (format) => format.toLowerCase().replace(/^\./, "") === extension,
  );
}

/** Appends eligible items without dropping earlier choices; a limit of one replaces the choice. */
export function addPickerItems(
  selection: ReadonlyMap<string, PickerItem>,
  items: PickerItem[],
  limit: number | null,
  formats?: string[],
): Map<string, PickerItem> {
  const next = new Map(selection);
  for (const item of items) {
    const name = item.kind === "disk" ? item.entry.name : item.stub.name;
    if (!supportsPickerFile(name, formats)) continue;
    const key = pickerKey(item);
    if (limit === 1 && !next.has(key)) next.clear();
    if (limit !== null && next.size >= limit && !next.has(key)) break;
    next.set(key, item);
    if (limit === 1) break;
  }
  return next;
}
