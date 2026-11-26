import {
  signatureSaveButtons as serverLibrarySaveButtons,
  type SignatureSaveButton,
  type SignatureTranslate,
} from "@editor-core/components/tools/sign/signatureSaveButtons";
import type { StorageType } from "@editor/services/signatureStorageService";

export type { SignatureSaveButton, SignatureTranslate };

/**
 * SaaS keeps saved signatures in this browser, so a signature saves through a
 * single button and nothing is shared.
 */
export function signatureSaveButtons(
  storageType: StorageType | null,
  translate: SignatureTranslate,
): SignatureSaveButton[] {
  if (storageType !== "localStorage")
    return serverLibrarySaveButtons(storageType, translate);
  return [
    {
      scope: "personal",
      icon: "user",
      label: translate("saved.saveButton", "Save signature"),
    },
  ];
}
