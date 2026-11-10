import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { alert } from "@editor/components/toast";
import { useFileActions } from "@editor/contexts/FileContext";
import { useSaveMode } from "@editor/hooks/useSaveMode";
import { useSaveTargets } from "@editor/hooks/useSaveTargets";
import { getDiskFileState } from "@editor/services/desktopFileLink";
import { downloadFile, SAVES_TO_DISK } from "@editor/services/downloadService";
import { fileStorage } from "@editor/services/fileStorage";
import { enforceExportPolicies } from "@editor/services/policyExport";
import { requestSaveChoice } from "@editor/services/saveChoice";
import { renameStoredFile } from "@editor/services/renameStoredFile";
import {
  copyFileName,
  siblingPath,
  type SaveHomeMode,
  type SaveMode,
} from "@editor/services/saveMode";
import type { SaveOutcome, SaveTarget } from "@editor/services/saveTargets";
import type { StirlingFileStub } from "@editor/types/fileContext";

export interface SaveOptions {
  /** Export policies already ran on the file passed in, so they do not run again. */
  policiesEnforced?: boolean;
}

export interface SaveStoredFile {
  /** The target Save sends this file to, or undefined for disk and downloads. */
  targetFor: (stub: StirlingFileStub) => SaveTarget | undefined;
  /** What Save does for this file, or null when it has no home yet. */
  planFor: (stub: StirlingFileStub) => SaveMode | null;
  /** The target's Save label for this file, or undefined when no target handles it. */
  targetSaveLabel: (stub: StirlingFileStub) => string | undefined;
  /** Unsaved against where Save sends this file. */
  isUnsaved: (stub: StirlingFileStub) => boolean;
  /** Save where the toolbar's Save would; nothing to do when that home already
   *  holds this version. */
  saveStoredFile: (
    stub: StirlingFileStub,
    file?: File,
    options?: SaveOptions,
  ) => Promise<SaveOutcome>;
  /** Update the file's home, or save a copy next to it, whatever the setting. */
  saveToHome: (
    stub: StirlingFileStub,
    how: SaveHomeMode,
    file?: File,
    options?: SaveOptions,
  ) => Promise<SaveOutcome>;
  /** A one-off copy (a download or a Save As) that keeps the file's home. */
  saveLocalCopy: (
    stub: StirlingFileStub,
    file?: File,
    options?: SaveOptions,
  ) => Promise<SaveOutcome>;
}

/** A free "name (edited).pdf" beside the file, or null if none is free. */
async function freeCopyPath(
  path: string,
  name: string,
): Promise<{ path: string; name: string } | null> {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const copyName = copyFileName(name, attempt);
    const copyPath = siblingPath(path, copyName);
    // Only a path known to be empty is safe; anything else could be overwritten.
    if ((await getDiskFileState(copyPath)).availability === "gone")
      return { path: copyPath, name: copyName };
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The toolbar's Save for one stored file, for every place that saves. */
export function useSaveStoredFile(): SaveStoredFile {
  const { t } = useTranslation();
  const { actions } = useFileActions();
  const targets = useSaveTargets();
  const { mode, locked, setMode } = useSaveMode();

  const targetFor = useCallback(
    (stub: StirlingFileStub) => targets.find((target) => target.handles(stub)),
    [targets],
  );

  const planFor = useCallback(
    (stub: StirlingFileStub): SaveMode | null => {
      const target = targetFor(stub);
      if (target) return target.plan?.(stub, mode) ?? mode;
      if (!stub.localFilePath) return null;
      // A copy Stirling wrote is ours to keep updating.
      return stub.localFileIsCopy ? "replace" : mode;
    },
    [targetFor, mode],
  );

  const targetSaveLabel = useCallback(
    (stub: StirlingFileStub) => {
      const target = targetFor(stub);
      return target?.saveLabel(stub, target.plan?.(stub, mode) ?? mode);
    },
    [targetFor, mode],
  );

  const isUnsaved = useCallback(
    (stub: StirlingFileStub) => {
      const target = targetFor(stub);
      return target
        ? target.isUnsaved(stub)
        : Boolean(stub.isDirty && stub.localFilePath);
    },
    [targetFor],
  );

  const fail = useCallback(
    (body: string): SaveOutcome => {
      alert({
        alertType: "error",
        title: t("fileEditor.saveFailed", "Save failed"),
        body,
        privateBody: true,
        expandable: false,
      });
      return "failed";
    },
    [t],
  );

  // Reads the file and runs export policies; null when there is nothing to save.
  const prepare = useCallback(
    async (
      stub: StirlingFileStub,
      file?: File,
      options?: SaveOptions,
    ): Promise<File | null> => {
      if (file && options?.policiesEnforced) return file;
      const source = file ?? (await fileStorage.getStirlingFile(stub.id));
      if (!source) {
        fail(
          t(
            "fileSidebar.dataLostBody",
            "Couldn't find this file's contents. Add it again to keep working with it.",
          ),
        );
        return null;
      }
      const [data] = await enforceExportPolicies([source], [stub.id]);
      return data ?? source;
    },
    [fail, t],
  );

  const writeLocal = useCallback(
    async (
      stub: StirlingFileStub,
      data: File,
      where: "home" | "elsewhere",
    ): Promise<SaveOutcome> => {
      const result = await downloadFile({
        data,
        // Stub name, not File.name: a rename only writes the stub.
        filename: stub.name,
        localPath: where === "home" ? stub.localFilePath : undefined,
        fileId: stub.id,
      });
      if (result.cancelled) return "cancelled";
      if (where === "home" && result.savedPath)
        actions.updateStirlingFileStub(stub.id, {
          localFilePath: stub.localFilePath ?? result.savedPath,
          isDirty: false,
        });
      return "saved";
    },
    [actions],
  );

  const writeDiskCopy = useCallback(
    async (
      stub: StirlingFileStub,
      localFilePath: string,
      data: File,
    ): Promise<SaveOutcome> => {
      const copy = await freeCopyPath(localFilePath, stub.name);
      if (!copy)
        return fail(
          t(
            "saveFile.noFreeCopyName",
            "Couldn't find a free name for the copy next to {{name}}.",
            { name: stub.name },
          ),
        );
      await downloadFile({
        data,
        filename: copy.name,
        localPath: copy.path,
        fileId: stub.id,
      });
      // The copy becomes the file's home, so later saves keep updating it.
      await renameStoredFile(stub, copy.name, actions.updateStirlingFileStub);
      actions.updateStirlingFileStub(stub.id, {
        localFilePath: copy.path,
        localFileIsCopy: true,
        isDirty: false,
      });
      return "saved";
    },
    [actions, fail, t],
  );

  const saveToHome = useCallback(
    async (
      stub: StirlingFileStub,
      how: SaveHomeMode,
      file?: File,
      options?: SaveOptions,
    ): Promise<SaveOutcome> => {
      try {
        const data = await prepare(stub, file, options);
        if (!data) return "failed";
        const target = targetFor(stub);
        if (target) {
          const outcome = await target.save(stub, data, how);
          return outcome === "fallback"
            ? writeLocal(stub, data, "elsewhere")
            : outcome;
        }
        return how === "copy" && stub.localFilePath
          ? writeDiskCopy(stub, stub.localFilePath, data)
          : writeLocal(stub, data, "home");
      } catch (error) {
        return fail(errorMessage(error));
      }
    },
    [prepare, targetFor, writeLocal, writeDiskCopy, fail],
  );

  const saveLocalCopy = useCallback(
    async (
      stub: StirlingFileStub,
      file?: File,
      options?: SaveOptions,
    ): Promise<SaveOutcome> => {
      try {
        const data = await prepare(stub, file, options);
        return data ? writeLocal(stub, data, "elsewhere") : "failed";
      } catch (error) {
        return fail(errorMessage(error));
      }
    },
    [prepare, writeLocal, fail],
  );

  const saveStoredFile = useCallback(
    async (
      stub: StirlingFileStub,
      file?: File,
      options?: SaveOptions,
    ): Promise<SaveOutcome> => {
      // Its home already holds this version, and a rewrite would only wake the
      // disk watcher. A file flagged as changed on disk is not current: saving
      // is how the user keeps their version over the disk one.
      const homeCurrent =
        Boolean(targetFor(stub) || stub.localFilePath) &&
        !isUnsaved(stub) &&
        !stub.diskConflictAt;
      if (homeCurrent) return "saved";
      const plan = planFor(stub);
      if (plan !== "ask")
        return saveToHome(stub, plan ?? "replace", file, options);

      const target = targetFor(stub);
      const answer = await requestSaveChoice({
        fileName: stub.name,
        copyName: copyFileName(stub.name),
        homeName: target
          ? target.homeName(stub)
          : t("saveFile.ask.thisFolder", "the same folder"),
        otherLabel: SAVES_TO_DISK
          ? t("saveFile.menu.saveCopyElsewhere", "Save a copy somewhere else…")
          : t("saveFile.ask.download", "Download instead"),
        canRemember: !locked,
      });
      if (!answer) return "cancelled";
      if (answer.choice === "other") return saveLocalCopy(stub, file, options);
      if (answer.remember) setMode(answer.choice);
      return saveToHome(stub, answer.choice, file, options);
    },
    [
      planFor,
      isUnsaved,
      saveToHome,
      saveLocalCopy,
      targetFor,
      locked,
      setMode,
      t,
    ],
  );

  return useMemo(
    () => ({
      targetFor,
      planFor,
      targetSaveLabel,
      isUnsaved,
      saveStoredFile,
      saveToHome,
      saveLocalCopy,
    }),
    [
      targetFor,
      planFor,
      targetSaveLabel,
      isUnsaved,
      saveStoredFile,
      saveToHome,
      saveLocalCopy,
    ],
  );
}
