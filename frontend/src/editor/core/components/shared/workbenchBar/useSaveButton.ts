import { useTranslation } from "react-i18next";
import type { IconName } from "@editor/ui/Icon";
import type { SaveStoredFile } from "@editor/hooks/useSaveStoredFile";
import {
  saveTargetLabel,
  sharedSaveTarget,
  type SaveMenuItem,
} from "@editor/services/saveTargets";
import type { StirlingFileStub } from "@editor/types/fileContext";
import { SAVES_TO_DISK } from "@editor/services/downloadService";

export interface SaveButton {
  /** Replaces the plain Download/Save label when a target handles the files. */
  label?: string;
  icon?: IconName;
  unsaved: boolean;
  /** The other destinations, for the "More save options" menu. */
  menu?: SaveMenuItem[];
}

interface Options {
  saver: SaveStoredFile;
  targets: StirlingFileStub[];
  /** The viewer acts on one file, so it also offers that file's destinations. */
  singleFile: boolean;
  onSaveLocalCopy: () => void;
  /** The file as the viewer shows it, annotations included. */
  fileFor: (stub: StirlingFileStub) => Promise<File | undefined>;
}

/** What the toolbar's Save does for these files, and the other destinations. */
export function useSaveButton({
  saver,
  targets,
  singleFile,
  onSaveLocalCopy,
  fileFor,
}: Options): SaveButton {
  const { t } = useTranslation();
  const unsaved = targets.some(saver.isUnsaved);
  const shared = sharedSaveTarget(targets, saver.targetFor);
  const label = shared
    ? saveTargetLabel(shared, targets)
    : targets.some((stub) => saver.targetFor(stub))
      ? t("saveFile.toolbar.mixed", "Save all")
      : undefined;
  const icon = shared?.icon;

  const stub = singleFile ? targets[0] : undefined;
  const target = stub ? saver.targetFor(stub) : undefined;
  if (!SAVES_TO_DISK && !target) return { label, icon, unsaved };

  const menu: SaveMenuItem[] = [
    SAVES_TO_DISK
      ? {
          key: "local",
          label: t("saveFile.menu.saveCopy", "Save a copy..."),
          icon: "laptop",
          onClick: onSaveLocalCopy,
        }
      : {
          key: "local",
          label: t("download", "Download"),
          icon: "download",
          onClick: onSaveLocalCopy,
        },
  ];
  if (stub && target?.menuItems)
    menu.push(...target.menuItems(stub, () => fileFor(stub)));
  return { label, icon, unsaved, menu };
}
