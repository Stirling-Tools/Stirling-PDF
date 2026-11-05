import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { alert, dismissToast } from "@editor/components/toast";
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
  type OneDriveFailure,
} from "@editor/services/oneDrivePickerService";
import {
  copyName,
  OneDriveSaveError,
  saveToOneDrive,
  type OneDriveSaveTarget,
} from "@editor/services/oneDriveSave";
import { openExternal } from "@editor/platform/openExternal";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { hasUnsavedCloudChanges } from "@editor/services/oneDriveSave";
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

  const failureMessage = useCallback(
    (failure: OneDriveFailure | "failed" | null): string => {
      switch (failure) {
        case "popupBlocked":
          return t(
            "provider.onedrive.errors.popupBlocked",
            "Your browser blocked the Microsoft sign-in window. Allow pop-ups for this site and try again.",
          );
        case "reconnect":
          return t(
            "provider.onedrive.errors.reconnect",
            "Your Microsoft account needs to sign in again. Reconnect it in Settings > Connected accounts.",
          );
        case "network":
          return t(
            "provider.onedrive.errors.unreachable",
            "Couldn't reach OneDrive. Check your connection and try again.",
          );
        default:
          return t(
            "provider.onedrive.errors.serverError",
            "OneDrive or the Stirling server had a problem. Try again, or ask your administrator if it keeps happening.",
          );
      }
    },
    [t],
  );

  const reconnectAction = useCallback(
    () => ({
      buttonText: t("oneDriveSave.reconnect", "Reconnect"),
      buttonCallback: () => navigate(CONNECTED_ACCOUNTS_SETTINGS_PATH),
    }),
    [navigate, t],
  );

  const run = useCallback(
    async (
      stub: StirlingFileStub,
      target: OneDriveSaveTarget,
      content?: File,
    ): Promise<boolean> => {
      const stored = content ?? (await fileStorage.getStirlingFile(stub.id));
      if (!stored) {
        alert({
          alertType: "error",
          title: t("oneDriveSave.failedTitle", "Couldn't save to OneDrive"),
          body: t(
            "fileSidebar.dataLostBody",
            "This browser lost this file's contents. Upload it again to keep working with it.",
          ),
          expandable: false,
        });
        return false;
      }
      let file: File = stored;
      // Callers that pass content have already run export policies on it.
      if (!content) {
        try {
          [file] = await enforceExportPolicies([stored], [stub.id]);
        } catch (error) {
          alert({
            alertType: "error",
            title: t("oneDriveSave.failedTitle", "Couldn't save to OneDrive"),
            body: error instanceof Error ? error.message : String(error),
            expandable: false,
          });
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
          code === "conflict" && target.kind === "replace"
            ? target.origin
            : null;
        const toastId: string = alert({
          alertType: "error",
          title: t("oneDriveSave.failedTitle", "Couldn't save to OneDrive"),
          body:
            code === "conflict"
              ? t(
                  "oneDriveSave.conflict",
                  "Someone changed this file in OneDrive after you opened it. Save your version as a copy instead.",
                )
              : failureMessage(code),
          expandable: false,
          ...(copyTarget
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
              : {}),
        });
        return false;
      } finally {
        setSaving(null);
      }
    },
    [actions, failureMessage, reconnectAction, t],
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
      const fail = (failure: OneDriveFailure | null) =>
        alert({
          alertType: "error",
          title: t("oneDriveSave.failedTitle", "Couldn't save to OneDrive"),
          body: failureMessage(failure),
          expandable: false,
          ...(failure === "reconnect" ? reconnectAction() : {}),
        });
      const cancelled = (err: unknown) =>
        (err as { errorCode?: string } | null)?.errorCode === "user_cancelled";
      let account;
      try {
        ({ account } = await ensureConnectedAccount(
          "microsoft",
          connected.connect,
        ));
      } catch (err) {
        if (!cancelled(err)) fail(classifyOneDriveFailure(err));
        return;
      }
      if (!account) {
        alert({
          alertType: "error",
          title: t("oneDriveSave.failedTitle", "Couldn't save to OneDrive"),
          body: t(
            "provider.onedrive.errors.connectFailed",
            "Couldn't connect your Microsoft account. Try again from Settings > Connected accounts.",
          ),
          expandable: false,
        });
        return;
      }
      if (account.personal) {
        alert({
          alertType: "error",
          title: t("oneDriveSave.failedTitle", "Couldn't save to OneDrive"),
          body: t(
            "oneDriveSave.personalUnsupported",
            "Saving to a chosen folder needs a work or school Microsoft account.",
          ),
          expandable: false,
        });
        return;
      }
      let folder;
      try {
        folder = await getOneDrivePickerService().pickFolder(
          {
            locale: i18n?.language,
            labels: {
              title: t(
                "oneDriveSave.chooseFolder",
                "Choose a OneDrive folder to save to",
              ),
              close: t("close", "Close"),
              loading: t(
                "provider.onedrive.pickerLoading",
                "Connecting to OneDrive…",
              ),
            },
          },
          { accountId: account.id },
        );
      } catch (err) {
        if (!cancelled(err)) fail(classifyOneDriveFailure(err));
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
    [
      connected.connect,
      failureMessage,
      i18n?.language,
      reconnectAction,
      run,
      t,
    ],
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
      menuItems: (stub, file) => [
        {
          key: "folder",
          label: t("oneDriveSave.saveToFolder", "Save to a OneDrive folder…"),
          description: t(
            "oneDriveSave.menu.folderHint",
            "Work or school accounts",
          ),
          icon: "folder-up",
          onClick: () => void file().then((f) => saveToFolder(stub, f)),
        },
      ],
      saving,
    };
  }, [available, save, saveCopy, saveToFolder, saving, t]);

  return {
    available,
    saving,
    target,
    save,
    saveCopy,
    saveToFolder,
    openInOneDrive,
  };
}
