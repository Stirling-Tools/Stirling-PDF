/** What Save does for a file that has a home (disk, or a save target). */
export type SaveMode = "replace" | "copy" | "ask";

export const SAVE_MODES: readonly SaveMode[] = ["replace", "copy", "ask"];

export const DEFAULT_SAVE_MODE: SaveMode = "replace";

export function parseSaveMode(value: unknown): SaveMode | undefined {
  const mode = typeof value === "string" ? value.toLowerCase() : "";
  return (SAVE_MODES as readonly string[]).includes(mode)
    ? (mode as SaveMode)
    : undefined;
}

/** "Report.pdf" -> "Report (edited).pdf", then "(edited 2)" and so on. */
export function copyFileName(name: string, attempt = 1): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const tag = attempt > 1 ? `edited ${attempt}` : "edited";
  return `${base} (${tag})${ext}`;
}

/** The same folder as `path`, with `name` as the file name. */
export function siblingPath(path: string, name: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut >= 0 ? path.slice(0, cut + 1) + name : name;
}
