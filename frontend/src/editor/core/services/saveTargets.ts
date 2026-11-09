import type { IconName } from "@editor/ui/Icon";
import type { FileId } from "@editor/types/file";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { SaveHomeMode, SaveMode } from "@editor/services/saveMode";

export type SaveOutcome = "saved" | "cancelled" | "failed";

export interface SaveMenuItem {
  key: string;
  label: string;
  description?: string;
  icon: IconName;
  onClick: () => void;
}

/**
 * A place Save can write a file back to, such as a cloud drive. Files no target
 * handles save the built-in way: to their disk path on desktop, else a download.
 */
export interface SaveTarget {
  id: string;
  handles: (stub: StirlingFileStub) => boolean;
  /** True when this version is not saved to the target yet. */
  isUnsaved: (stub: StirlingFileStub) => boolean;
  /** What Save does for this file, e.g. "Update Report.pdf in OneDrive". */
  saveLabel: (stub: StirlingFileStub, mode: SaveMode) => string;
  /** The file's name where it lives, when that differs from Stirling's. */
  fileName?: (stub: StirlingFileStub) => string;
  /** Where the file lives, for the "Ask each time" dialog, e.g. "OneDrive". */
  homeName: (stub: StirlingFileStub) => string;
  /** Overrides the save setting, e.g. a copy Stirling made is always updated. */
  plan?: (stub: StirlingFileStub, mode: SaveMode) => SaveMode;
  /** Label for several files, e.g. "Save all to OneDrive". */
  saveAllLabel: () => string;
  statusLabel: (unsaved: boolean) => string;
  icon: IconName;
  /** "fallback" hands the file back to the built-in save, e.g. a download. */
  save: (
    stub: StirlingFileStub,
    file: File,
    how: SaveHomeMode,
  ) => Promise<SaveOutcome | "fallback">;
  /** Other destinations this target offers for one file. */
  menuItems?: (
    stub: StirlingFileStub,
    file: () => Promise<File | undefined>,
  ) => SaveMenuItem[];
  /** The file being saved right now, if any. */
  saving?: FileId | null;
}

export function sharedSaveTarget(
  stubs: StirlingFileStub[],
  targetFor: (stub: StirlingFileStub) => SaveTarget | undefined,
): SaveTarget | undefined {
  const first = stubs.length > 0 ? targetFor(stubs[0]) : undefined;
  return first && stubs.every((stub) => targetFor(stub) === first)
    ? first
    : undefined;
}
