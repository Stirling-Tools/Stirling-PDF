import type { StirlingFileStub } from "@editor/types/fileContext";
import { isAxiosError } from "axios";
import apiClient from "@editor/services/apiClient";
import type { CloudOrigin } from "@editor/types/file";
import { isMicrosoftProtectedPdf } from "@editor/services/rightsManagedPdf";
import { inMemoryFile } from "@editor/utils/inMemoryFile";
import type { ConnectedAccount } from "@editor/services/connectedAccountsService";

export type OneDriveSaveTarget =
  | { kind: "replace"; origin: CloudOrigin }
  | { kind: "copy"; origin: CloudOrigin; name: string }
  | {
      kind: "folder";
      accountId: number;
      driveId: string;
      folderId: string;
      name: string;
    };

export class OneDriveSaveError extends Error {
  constructor(
    readonly code:
      | "conflict"
      | "missing"
      | "reconnect"
      | "network"
      | "server"
      | "unprotected"
      | "failed",
    message: string,
  ) {
    super(message);
  }
}

interface SavedItem {
  driveId: string;
  itemId: string;
  parentId: string | null;
  name: string;
  eTag: string | null;
  webUrl: string | null;
}

function targetAccountId(target: OneDriveSaveTarget): number {
  return target.kind === "folder" ? target.accountId : target.origin.accountId;
}

export function withLiveAccount(
  target: OneDriveSaveTarget,
  accounts: readonly ConnectedAccount[],
): OneDriveSaveTarget | null {
  const live = accounts.filter(
    (account) =>
      account.provider === "microsoft" && account.status === "CONNECTED",
  );
  const accountId = targetAccountId(target);
  if (live.some((account) => account.id === accountId)) return target;
  if (live.length !== 1) return null;
  if (target.kind === "folder") return { ...target, accountId: live[0].id };
  return { ...target, origin: { ...target.origin, accountId: live[0].id } };
}

export async function saveToOneDrive(
  file: File,
  target: OneDriveSaveTarget,
): Promise<CloudOrigin> {
  const origin = target.kind === "folder" ? null : target.origin;
  const isProtected = await isMicrosoftProtectedPdf(file);
  if (origin?.protected && !isProtected) {
    throw new OneDriveSaveError(
      "unprotected",
      "This copy is no longer protected with Microsoft Purview, so it was not saved to OneDrive.",
    );
  }
  const accountId = targetAccountId(target);
  const form = new FormData();
  form.append("fileInput", await inMemoryFile(file));
  if (target.kind === "replace") {
    if (!target.origin.eTag) {
      throw new OneDriveSaveError(
        "conflict",
        "The OneDrive version of this file is unknown, so it was not replaced.",
      );
    }
    form.append("driveId", target.origin.driveId);
    form.append("itemId", target.origin.itemId);
    form.append("eTag", target.origin.eTag);
  } else if (target.kind === "copy") {
    if (!target.origin.parentId) {
      throw new OneDriveSaveError(
        "failed",
        "The OneDrive folder of this file is unknown.",
      );
    }
    form.append("driveId", target.origin.driveId);
    form.append("parentId", target.origin.parentId);
    form.append("name", target.name);
  } else {
    form.append("driveId", target.driveId);
    form.append("parentId", target.folderId);
    form.append("name", target.name);
  }
  try {
    const response = await apiClient.post<SavedItem>(
      `/api/v1/connected-accounts/${accountId}/drive/save`,
      form,
      { suppressErrorToast: true },
    );
    const saved = response.data;
    return {
      provider: "onedrive",
      accountId,
      driveId: saved.driveId,
      itemId: saved.itemId,
      parentId: saved.parentId,
      name: saved.name,
      eTag: saved.eTag,
      webUrl: saved.webUrl,
      protected: isProtected,
      stirlingCopy:
        target.kind !== "replace" || Boolean(target.origin.stirlingCopy),
    };
  } catch (error) {
    throw saveError(error);
  }
}

function saveError(error: unknown): OneDriveSaveError {
  const server = new OneDriveSaveError(
    "server",
    "OneDrive or the Stirling server had a problem saving the file.",
  );
  if (!isAxiosError<{ code?: string } | undefined>(error)) return server;
  const response = error.response;
  if (!response) {
    return new OneDriveSaveError(
      "network",
      "Couldn't reach OneDrive. Check your connection and try again.",
    );
  }
  if (response.status === 409 && response.data?.code === "conflict") {
    return new OneDriveSaveError(
      "conflict",
      "The file changed in OneDrive since you opened it.",
    );
  }
  if (response.status === 410 && response.data?.code === "missing") {
    return new OneDriveSaveError(
      "missing",
      "The file was moved or deleted in OneDrive.",
    );
  }
  if ([401, 403, 409].includes(response.status)) {
    return new OneDriveSaveError(
      "reconnect",
      "Your Microsoft account needs to sign in again.",
    );
  }
  return server;
}

export function copyName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)} (edited)${name.slice(dot)}`
    : `${name} (edited)`;
}

/** True when this version differs from the one last saved to OneDrive. */
export function hasUnsavedCloudChanges(stub: StirlingFileStub): boolean {
  const origin = stub.cloudOrigin;
  return Boolean(origin?.savedFileId && origin.savedFileId !== stub.id);
}
