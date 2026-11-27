import type { IconName } from "@editor/ui/Icon";
import type { StorageType } from "@editor/services/signatureStorageService";

export interface SignatureSaveButton {
  scope: "personal" | "shared";
  icon: IconName;
  label: string;
}

export type SignatureTranslate = (key: string, defaultValue: string) => string;

/**
 * The buttons a new signature can be saved through, for where saved signatures
 * are stored (`null` while that is still being detected). Saving goes to the
 * server's library, personal or shared, so browser storage offers none.
 */
export function signatureSaveButtons(
  storageType: StorageType | null,
  translate: SignatureTranslate,
): SignatureSaveButton[] {
  if (storageType === "localStorage") return [];
  return [
    {
      scope: "personal",
      icon: "user",
      label: translate("saved.savePersonal", "Save Personal"),
    },
    {
      scope: "shared",
      icon: "users",
      label: translate("saved.saveShared", "Save Shared"),
    },
  ];
}
