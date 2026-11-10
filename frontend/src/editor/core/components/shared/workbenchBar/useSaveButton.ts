import { useTranslation } from "react-i18next";
import type { IconName } from "@editor/ui/Icon";
import type { SaveStoredFile } from "@editor/hooks/useSaveStoredFile";
import {
  sharedSaveTarget,
  type SaveMenuItem,
} from "@editor/services/saveTargets";
import type { SaveHomeMode } from "@editor/services/saveMode";
import type { StirlingFileStub } from "@editor/types/fileContext";
import { useFileActionTerminology } from "@editor/hooks/useFileActionTerminology";
import { SAVES_TO_DISK } from "@editor/services/downloadService";

export interface SaveButton {
  /** Replaces the view's plural Download/Save label; set whenever one file is in play. */
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
  const terminology = useFileActionTerminology();
  const unsaved = targets.some(saver.isUnsaved);
  const shared = sharedSaveTarget(targets, saver.targetFor);
  const onlyStub = targets.length === 1 ? targets[0] : undefined;
  const onlyPlan = onlyStub ? saver.planFor(onlyStub) : null;
  const stub = singleFile ? targets[0] : undefined;
  const target = stub ? saver.targetFor(stub) : undefined;
  const plan = stub ? saver.planFor(stub) : null;

  let label: string | undefined;
  if (shared) {
    label =
      targets.length > 1
        ? shared.saveAllLabel()
        : saver.targetSaveLabel(targets[0]);
  } else if (targets.some((entry) => saver.targetFor(entry))) {
    label = t("saveFile.toolbar.mixed", "Save all");
  } else if (onlyStub && onlyPlan === "copy") {
    label = t("saveFile.toolbar.copy", "Save a copy of {{name}} next to it", {
      name: onlyStub.name,
    });
  } else if (onlyStub && onlyPlan === "ask") {
    label = t("saveFile.toolbar.ask", "Save {{name}}…", {
      name: onlyStub.name,
    });
  } else if (onlyStub) {
    label = terminology.download;
  }
  const icon = shared?.icon;

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
  if (stub && plan !== null) {
    // The other way to save home, so neither choice is ever out of reach.
    const where = target
      ? t("saveFile.menu.inHome", "In {{home}}", {
          home: target.homeName(stub),
        })
      : t("saveFile.menu.sameFolder", "In the same folder");
    const saveHome = (how: SaveHomeMode) => () =>
      void fileFor(stub).then((file) => saver.saveToHome(stub, how, file));
    if (plan !== "replace")
      menu.push({
        key: "replace",
        label: t("saveFile.menu.update", "Update {{name}}", {
          name: stub.name,
        }),
        description: where,
        icon: target?.icon ?? "save",
        onClick: saveHome("replace"),
      });
    if (plan !== "copy")
      menu.push({
        key: "copy",
        label: t("saveFile.menu.copy", "Save a copy next to it"),
        description: where,
        icon: "copy-plus",
        onClick: saveHome("copy"),
      });
  }
  if (stub && target?.menuItems)
    menu.push(...target.menuItems(stub, () => fileFor(stub)));
  return { label, icon, unsaved, menu };
}
