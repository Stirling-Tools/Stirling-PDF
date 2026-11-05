import { useTranslation } from "react-i18next";
import type { IconName } from "@editor/ui/Icon";
import type { SaveStoredFile } from "@editor/hooks/useSaveStoredFile";
import type { SaveMenuItem } from "@editor/services/saveTargets";
import type { StirlingFileStub } from "@editor/types/fileContext";

export interface SaveButton {
  /** Replaces the plain Download/Save label when a target handles the files. */
  label?: string;
  icon?: IconName;
  unsaved: boolean;
  /** "More save options"; replaces the Save As button when set. */
  menu?: SaveMenuItem[];
}

interface Options {
  saver: SaveStoredFile;
  targets: StirlingFileStub[];
  /** The viewer acts on one file, so it also offers that file's destinations. */
  singleFile: boolean;
  /** Desktop saves to disk; web downloads. */
  savesToDisk: boolean;
  onSaveLocalCopy: () => void;
  /** The file as the viewer shows it, annotations included. */
  fileFor: (stub: StirlingFileStub) => Promise<File | undefined>;
}

/** What the toolbar's Save does for these files, and the other destinations. */
export function useSaveButton({
  saver,
  targets,
  singleFile,
  savesToDisk,
  onSaveLocalCopy,
  fileFor,
}: Options): SaveButton {
  const { t } = useTranslation();
  const unsaved = targets.some(saver.isUnsaved);
  const handled = targets
    .map((stub) => ({ stub, target: saver.targetFor(stub) }))
    .filter((entry) => entry.target);
  const first = handled[0]?.target;
  const allOneTarget =
    handled.length > 0 &&
    handled.length === targets.length &&
    handled.every((entry) => entry.target === first);

  const stub = singleFile ? targets[0] : undefined;
  const target = stub ? saver.targetFor(stub) : undefined;
  const plan = stub ? saver.planFor(stub) : null;

  let label: string | undefined;
  if (allOneTarget && first) {
    label =
      handled.length > 1
        ? first.saveAllLabel()
        : first.saveLabel(targets[0], saver.planFor(targets[0]) ?? "replace");
  } else if (handled.length > 0) {
    label = t(
      "saveFile.toolbar.mixed",
      "Save all, each back to where it came from",
    );
  } else if (stub && plan === "copy") {
    label = t("saveFile.toolbar.copy", "Save a copy of {{name}} next to it", {
      name: stub.name,
    });
  } else if (stub && plan === "ask") {
    label = t("saveFile.toolbar.ask", "Save {{name}}…", { name: stub.name });
  }
  const icon = allOneTarget ? first?.icon : undefined;

  if (!savesToDisk && !target) return { label, icon, unsaved };

  const menu: SaveMenuItem[] = [
    savesToDisk
      ? {
          key: "local",
          label: target
            ? t("saveFile.menu.saveToComputer", "Save to this computer…")
            : t(
                "saveFile.menu.saveCopyElsewhere",
                "Save a copy somewhere else…",
              ),
          icon: "laptop",
          onClick: onSaveLocalCopy,
        }
      : {
          key: "local",
          label: t("saveFile.menu.download", "Download a copy"),
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
    const saveHome = (how: "replace" | "copy") => () =>
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
