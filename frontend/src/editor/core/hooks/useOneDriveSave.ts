import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { alert, dismissToast } from "@editor/components/toast";
import type { ToastOptions } from "@editor/components/toast/types";
import { useFileActions } from "@editor/contexts/FileContext";
import {
  ensureConnectedAccount,
  useConnectedAccounts,
} from "@editor/hooks/useConnectedAccounts";
import { useOneDrivePicker } from "@editor/hooks/useOneDrivePicker";
import { fileStorage } from "@editor/services/fileStorage";
import { enforceExportPolicies } from "@editor/services/policyExport";
import {
  classifyOneDriveFailure,
  getOneDrivePickerService,
  isUserCancelled,
} from "@editor/services/oneDrivePickerService";
import {
  copyName,
  hasUnsavedCloudChanges,
  OneDriveSaveError,
  saveToOneDrive,
  withLiveAccount,
  type OneDriveSaveTarget,
} from "@editor/services/oneDriveSave";
import {
  oneDriveConnectFailedMessage,
  oneDriveFailureMessage,
  oneDrivePickerLabels,
} from "@editor/services/oneDriveMessages";
import { openExternal } from "@editor/platform/openExternal";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import type { SaveTarget } from "@editor/services/saveTargets";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

export interface OneDriveSave {
  available: boolean;
  saving: FileId | null;
  /** Save's view of OneDrive; null when editor saves to OneDrive are off. */
  target: SaveTarget | null;
  save: (stub: StirlingFileStub, file?: File) => Promise<boolean>;
  saveCopy: (stub: StirlingFileStub, file?: File) => Promise<boolean>;
  canSaveToFolder: boolean;
  saveToFolder: (stub: StirlingFileStub, file?: File) => Promise<void>;
  openInOneDrive: (stub: StirlingFileStub) => void;
}

export const CONNECTED_ACCOUNTS_SETTINGS_PATH = "/settings/connectedAccounts";

export function useOneDriveSave(): OneDriveSave {
  const { t, i18n } = useTranslation();
  const { actions } = useFileActions();
  const connected = useConnectedAccounts();
  const picker = useOneDrivePicker();
  const navigate = useNavigate();
  const [saving, setSaving] = useState<FileId | null>(null);
  const { config } = useAppConfig();
  const available =
    picker.isEnabled &&
    connected.available("microsoft") &&
    config?.microsoftAllowEditorSaves !== false;
  const folderAccount = connected.accountFor("microsoft");
  const canSaveToFolder =
    available && Boolean(folderAccount) && !folderAccount?.personal;

  const reconnectAction = useCallback(
    () => ({
      buttonText: t("oneDriveSave.reconnect", "Reconnect"),
      buttonCallback: () => navigate(CONNECTED_ACCOUNTS_SETTINGS_PATH),
    }),
    [navigate, t],
  );

  const saveFailed = useCallback(
    (body: string, extra?: Partial<ToastOptions>): string =>
      alert({
        alertType: "error",
        title: t("oneDriveSave.failedTitle", "Couldn't save to OneDrive"),
        body,
        expandable: false,
        ...extra,
      }),
    [t],
  );

  const run = useCallback(
    async (
      stub: StirlingFileStub,
      requested: OneDriveSaveTarget,
      content?: File,
    ): Promise<boolean> => {
      const target = withLiveAccount(requested, connected.accounts);
      if (!target) {
        saveFailed(oneDriveFailureMessage(t, "reconnect"), reconnectAction());
        return false;
      }
      const stored = content ?? (await fileStorage.getStirlingFile(stub.id));
      if (!stored) {
        saveFailed(
          t(
            "fileSidebar.dataLostBody",
            "This browser lost this file's contents. Upload it again to keep working with it.",
          ),
        );
        return false;
      }
      let file: File = stored;
      // Callers that pass content have already run export policies on it.
      if (!content) {
        try {
          [file] = await enforceExportPolicies([stored], [stub.id]);
        } catch (error) {
          saveFailed(error instanceof Error ? error.message : String(error));
          return false;
        }
      }
      setSaving(stub.id);
      try {
        const origin = {
          ...(await saveToOneDrive(file, target)),
          savedFileId: stub.id,
        };
        actions.updateStirlingFileStub(stub.id, { cloudOrigin: origin });
        const remembered = await fileStorage.updateFileMetadata(stub.id, {
          cloudOrigin: origin,
        });
        if (!remembered) {
          alert({
            alertType: "warning",
            title: t("oneDriveSave.saved", "Saved to OneDrive"),
            body: t(
              "oneDriveSave.linkNotStored",
              "This browser couldn't remember the link to the OneDrive file. After a reload, save it as a copy instead.",
            ),
            expandable: false,
          });
          return true;
        }
        alert({
          alertType: "success",
          title: t("oneDriveSave.saved", "Saved to OneDrive"),
          body: origin.name,
          expandable: false,
          durationMs: 5000,
          ...(origin.webUrl
            ? {
                buttonText: t("oneDriveSave.open", "Open in OneDrive"),
                buttonCallback: () => void openExternal(origin.webUrl!),
              }
            : {}),
        });
        return true;
      } catch (error) {
        const code = error instanceof OneDriveSaveError ? error.code : "failed";
        const copyTarget =
          (code === "conflict" || code === "missing") &&
          target.kind === "replace"
            ? target.origin
            : null;
        const toastId: string = saveFailed(
          code === "conflict"
            ? t(
                "oneDriveSave.conflict",
                "This file has changed in OneDrive since this version was opened or saved. Save your version as a copy instead.",
              )
            : code === "missing"
              ? t(
                  "oneDriveSave.missing",
                  "This file was moved or deleted in OneDrive. Save your version as a copy instead.",
                )
              : oneDriveFailureMessage(t, code),
          copyTarget
            ? {
                isPersistentPopup: true,
                buttonText: t("oneDriveSave.saveCopy", "Save a copy"),
                buttonCallback: () => {
                  dismissToast(toastId);
                  void run(
                    stub,
                    {
                      kind: "copy",
                      origin: copyTarget,
                      name: copyName(copyTarget.name),
                    },
                    file,
                  );
                },
              }
            : code === "reconnect"
              ? reconnectAction()
              : {},
        );
        return false;
      } finally {
        setSaving(null);
      }
    },
    [actions, connected.accounts, reconnectAction, saveFailed, t],
  );

  const save = useCallback(
    async (stub: StirlingFileStub, file?: File) => {
      const origin = stub.cloudOrigin;
      return origin ? run(stub, { kind: "replace", origin }, file) : false;
    },
    [run],
  );

  const saveCopy = useCallback(
    async (stub: StirlingFileStub, file?: File) => {
      const origin = stub.cloudOrigin;
      if (!origin) return false;
      return run(
        stub,
        { kind: "copy", origin, name: copyName(origin.name) },
        file,
      );
    },
    [run],
  );

  const saveToFolder = useCallback(
    async (stub: StirlingFileStub, file?: File) => {
      const fail = (err: unknown) => {
        if (isUserCancelled(err)) return;
        const failure = classifyOneDriveFailure(err);
        saveFailed(
          oneDriveFailureMessage(t, failure),
          failure === "reconnect" ? reconnectAction() : undefined,
        );
      };
      let account;
      try {
        ({ account } = await ensureConnectedAccount(
          "microsoft",
          connected.connect,
        ));
      } catch (err) {
        fail(err);
        return;
      }
      if (!account) {
        saveFailed(oneDriveConnectFailedMessage(t));
        return;
      }
      if (account.personal) {
        saveFailed(
          t(
            "oneDriveSave.personalUnsupported",
            "Uploading to a chosen folder needs a work or school Microsoft account.",
          ),
        );
        return;
      }
      let folder;
      try {
        folder = await getOneDrivePickerService().pickFolder(
          {
            locale: i18n?.language,
            labels: oneDrivePickerLabels(
              t,
              t(
                "oneDriveSave.chooseFolder",
                "Choose a OneDrive folder to upload to",
              ),
            ),
          },
          { accountId: account.id },
        );
      } catch (err) {
        fail(err);
        return;
      }
      if (!folder) return;
      await run(
        stub,
        {
          kind: "folder",
          accountId: account.id,
          driveId: folder.driveId,
          folderId: folder.folderId,
          name: stub.name,
        },
        file,
      );
    },
    [connected.connect, i18n?.language, reconnectAction, run, saveFailed, t],
  );

  const openInOneDrive = useCallback((stub: StirlingFileStub) => {
    const url = stub.cloudOrigin?.webUrl;
    if (url) void openExternal(url);
  }, []);

  const target = useMemo<SaveTarget | null>(() => {
    if (!available) return null;
    return {
      id: "onedrive",
      handles: (stub) => Boolean(stub.cloudOrigin),
      isUnsaved: hasUnsavedCloudChanges,
      saveLabel: (stub, mode) => {
        const name = stub.cloudOrigin?.name ?? stub.name;
        if (mode === "copy")
          return t(
            "oneDriveSave.toolbar.copy",
            "Save a copy of {{name}} to OneDrive",
            { name },
          );
        if (mode === "ask")
          return t("oneDriveSave.toolbar.ask", "Save {{name}}…", { name });
        return t(
          "oneDriveSave.toolbar.replace",
          "Update {{name}} in OneDrive",
          {
            name,
          },
        );
      },
      saveAllLabel: () =>
        t("oneDriveSave.toolbar.saveAll", "Save all to OneDrive"),
      fileName: (stub) => stub.cloudOrigin?.name ?? stub.name,
      homeName: () => t("oneDriveSave.homeName", "OneDrive"),
      // A copy Stirling made is ours to keep updating, whatever the setting.
      plan: (stub, mode) => (stub.cloudOrigin?.stirlingCopy ? "replace" : mode),
      statusLabel: (unsaved) =>
        unsaved
          ? t(
              "oneDriveSave.status.unsaved",
              "Changes not saved to OneDrive yet",
            )
          : t("oneDriveSave.status.saved", "Saved to OneDrive"),
      icon: "cloud-upload",
      save: async (stub, file, how) =>
        (await (how === "copy" ? saveCopy(stub, file) : save(stub, file)))
          ? "saved"
          : "failed",
      menuItems: (stub, file) =>
        canSaveToFolder
          ? [
              {
                key: "folder",
                label: t(
                  "oneDriveSave.saveToFolder",
                  "Upload copy to OneDrive…",
                ),
                description: t(
                  "oneDriveSave.menu.folderHint",
                  "Choose a folder",
                ),
                icon: "folder-up",
                onClick: () => void file().then((f) => saveToFolder(stub, f)),
              },
            ]
          : [],
      saving,
    };
  }, [available, canSaveToFolder, save, saveCopy, saveToFolder, saving, t]);

  return useMemo(
    () => ({
      available,
      saving,
      target,
      save,
      saveCopy,
      canSaveToFolder,
      saveToFolder,
      openInOneDrive,
    }),
    [
      available,
      saving,
      target,
      save,
      saveCopy,
      canSaveToFolder,
      saveToFolder,
      openInOneDrive,
    ],
  );
}
