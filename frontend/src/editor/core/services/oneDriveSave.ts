import { isAxiosError } from "axios";
import apiClient from "@editor/services/apiClient";
import type { CloudOrigin } from "@editor/types/file";
import { isMicrosoftProtectedPdf } from "@editor/services/rightsManagedPdf";

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
  const accountId =
    target.kind === "folder" ? target.accountId : target.origin.accountId;
  const form = new FormData();
  form.append("fileInput", file);
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
    };
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 409) {
      const body = error.response.data as { code?: string } | undefined;
      throw new OneDriveSaveError(
        body?.code === "conflict" ? "conflict" : "reconnect",
        body?.code === "conflict"
          ? "The file changed in OneDrive since you opened it."
          : "Your Microsoft account needs to sign in again.",
      );
    }
    if (isAxiosError(error) && !error.response) {
      throw new OneDriveSaveError(
        "network",
        "Couldn't reach OneDrive. Check your connection and try again.",
      );
    }
    if (
      isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      throw new OneDriveSaveError(
        "reconnect",
        "Your Microsoft account needs to sign in again.",
      );
    }
    throw new OneDriveSaveError(
      "server",
      "OneDrive or the Stirling server had a problem saving the file.",
    );
  }
}

export function copyName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)} (edited)${name.slice(dot)}`
    : `${name} (edited)`;
}
