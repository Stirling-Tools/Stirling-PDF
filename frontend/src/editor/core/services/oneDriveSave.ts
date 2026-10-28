import { isAxiosError } from "axios";
import apiClient from "@editor/services/apiClient";
import type { CloudOrigin } from "@editor/types/file";

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
    readonly code: "conflict" | "reconnect" | "failed",
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
  const accountId =
    target.kind === "folder" ? target.accountId : target.origin.accountId;
  const form = new FormData();
  form.append("fileInput", file);
  if (target.kind === "replace") {
    form.append("driveId", target.origin.driveId);
    form.append("itemId", target.origin.itemId);
    if (target.origin.eTag) form.append("eTag", target.origin.eTag);
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
    throw new OneDriveSaveError(
      "failed",
      "Couldn't save to OneDrive. Check your connection and try again.",
    );
  }
}

export function copyName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)} (edited)${name.slice(dot)}`
    : `${name} (edited)`;
}
