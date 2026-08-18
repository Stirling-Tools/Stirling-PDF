/**
 * The files page's one filter model. Every toolbar control writes one field
 * here, and visibility is decided in a single pass — so a new facet extends
 * this model instead of adding another ad-hoc `.filter` chain, and the text
 * box is one unified filter over everything we know about a file rather than
 * a name-only sub-search.
 */

import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileOrigin } from "@app/components/filesPage/fileOrigin";
import type { FilesPageOriginFilter } from "@app/contexts/FilesPageContext";

export interface FileFilters {
  /**
   * Free text. Matches the file's name and, where classification exists, its
   * label and category names — typing "user guide" or "finance" finds the
   * files so tagged, not just files named that way.
   */
  text: string;
  origin: FilesPageOriginFilter;
  /** Uppercase extensions to keep; empty keeps every type. */
  types: string[];
  /** Category (label family) id, or "all". */
  category: string;
}

/** What the pure matcher needs from the environment. */
export interface FileFilterContext {
  originOf: (stub: StirlingFileStub) => FileOrigin;
  /** Labels the selected category rolls up; null when no category is chosen. */
  categoryLabelKeys: ReadonlySet<string> | null;
  /** Whether a file's labels satisfy the text needle (never, without classification). */
  labelsMatchText: (
    labels: string[] | null | undefined,
    needle: string,
  ) => boolean;
}

export function fileMatchesFilters(
  stub: StirlingFileStub,
  filters: FileFilters,
  ctx: FileFilterContext,
): boolean {
  const needle = filters.text.trim().toLowerCase();
  if (
    needle &&
    !stub.name.toLowerCase().includes(needle) &&
    !ctx.labelsMatchText(stub.classificationLabels, needle)
  ) {
    return false;
  }
  if (filters.origin !== "all" && ctx.originOf(stub) !== filters.origin) {
    return false;
  }
  if (filters.types.length > 0) {
    const ext = (stub.name.split(".").pop() ?? "").toUpperCase();
    if (!filters.types.includes(ext)) {
      return false;
    }
  }
  if (ctx.categoryLabelKeys) {
    const labels = stub.classificationLabels ?? [];
    if (!labels.some((label) => ctx.categoryLabelKeys!.has(label))) {
      return false;
    }
  }
  return true;
}
