import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { alert } from "@editor/components/toast";
import { useFileActions } from "@editor/contexts/FileContext";
import { useSaveTargets } from "@editor/hooks/useSaveTargets";
import { downloadFile } from "@editor/services/downloadService";
import { fileStorage } from "@editor/services/fileStorage";
import { enforceExportPolicies } from "@editor/services/policyExport";
import type { SaveOutcome, SaveTarget } from "@editor/services/saveTargets";
import type { StirlingFileStub } from "@editor/types/fileContext";

export interface SaveOptions {
  /** Export policies already ran on the file passed in, so they do not run again. */
  policiesEnforced?: boolean;
}

export interface SaveStoredFile {
  /** The target Save sends this file to, or undefined for disk and downloads. */
  targetFor: (stub: StirlingFileStub) => SaveTarget | undefined;
  /** Unsaved against where Save sends this file. */
  isUnsaved: (stub: StirlingFileStub) => boolean;
  /** Save where the toolbar's Save would; nothing to do when that home already
   *  holds this version. */
  saveStoredFile: (
    stub: StirlingFileStub,
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

/** The toolbar's Save for one stored file, for every place that saves. */
export function useSaveStoredFile(): SaveStoredFile {
  const { t } = useTranslation();
  const { actions } = useFileActions();
  const targets = useSaveTargets();

  const targetFor = useCallback(
    (stub: StirlingFileStub) => targets.find((target) => target.handles(stub)),
    [targets],
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

  const write = useCallback(
    async (
      stub: StirlingFileStub,
      file: File | undefined,
      local: "save" | "copy",
      { policiesEnforced = false }: SaveOptions = {},
    ): Promise<SaveOutcome> => {
      const fail = (body: string): SaveOutcome => {
        alert({
          alertType: "error",
          title: t("fileEditor.saveFailed", "Save failed"),
          body,
          privateBody: true,
          expandable: false,
        });
        return "failed";
      };
      // Its home already holds this version, and a rewrite would only wake the
      // disk watcher. A file flagged as changed on disk is not current: saving
      // is how the user keeps their version over the disk one.
      const homeCurrent =
        local === "save" &&
        Boolean(targetFor(stub) || stub.localFilePath) &&
        !isUnsaved(stub) &&
        !stub.diskConflictAt;
      if (homeCurrent) return "saved";
      try {
        const source = file ?? (await fileStorage.getStirlingFile(stub.id));
        if (!source)
          return fail(
            t(
              "fileSidebar.dataLostBody",
              "This browser lost this file's contents. Upload it again to keep working with it.",
            ),
          );
        const [enforced] = policiesEnforced
          ? [source]
          : await enforceExportPolicies([source], [stub.id]);
        const data = enforced ?? source;
        const target = local === "save" ? targetFor(stub) : undefined;
        if (target) {
          const outcome = await target.save(stub, data);
          if (outcome !== "fallback") return outcome;
        }
        const linksToDisk = local === "save" && !target;
        const result = await downloadFile({
          data,
          // Stub name, not File.name: a rename only writes the stub.
          filename: stub.name,
          localPath: linksToDisk ? stub.localFilePath : undefined,
          fileId: stub.id,
        });
        if (result.cancelled) return "cancelled";
        if (linksToDisk && result.savedPath)
          actions.updateStirlingFileStub(stub.id, {
            localFilePath: stub.localFilePath ?? result.savedPath,
            isDirty: false,
          });
        return "saved";
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
    [actions, targetFor, isUnsaved, t],
  );

  const saveStoredFile = useCallback(
    (stub: StirlingFileStub, file?: File, options?: SaveOptions) =>
      write(stub, file, "save", options),
    [write],
  );
  const saveLocalCopy = useCallback(
    (stub: StirlingFileStub, file?: File, options?: SaveOptions) =>
      write(stub, file, "copy", options),
    [write],
  );

  return useMemo(
    () => ({ targetFor, isUnsaved, saveStoredFile, saveLocalCopy }),
    [targetFor, isUnsaved, saveStoredFile, saveLocalCopy],
  );
}
