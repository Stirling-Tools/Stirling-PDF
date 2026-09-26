import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { alert } from "@app/components/toast";
import { useSavedSignatures } from "@app/hooks/tools/sign/useSavedSignatures";
import { useDefaultSignature } from "@app/hooks/tools/sign/useDefaultSignature";
import { uniqueName } from "@app/utils/uniqueName";
import type { SavedSignature } from "@app/types/signature";
import type {
  CreatedSignature,
  SaveChoice,
} from "@app/components/tools/sign/createSignature/types";
import {
  DRAFT_KEY,
  createdToPayload,
  savedToPayload,
  toWalletEntry,
  type WalletEntry,
} from "@app/components/tools/sign/wallet/walletEntry";

function ownFirstDefault(
  signatures: SavedSignature[],
  defaultId: string | null,
) {
  const own = signatures.filter((sig) => sig.scope !== "shared");
  return [...own].sort(
    (a, b) => Number(b.id === defaultId) - Number(a.id === defaultId),
  );
}

export function useSignatureLibrary() {
  const { t } = useTranslation();
  const {
    savedSignatures,
    ownCount,
    isLoading,
    isAtCapacity,
    maxLimit,
    storageType,
    isAdmin,
    addSignature,
    removeSignature,
    updateSignatureLabel,
  } = useSavedSignatures();
  const { defaultId, setDefaultId } = useDefaultSignature();
  const [draft, setDraft] = useState<WalletEntry | null>(null);

  const labels = useMemo(
    () => savedSignatures.map((sig) => sig.label),
    [savedSignatures],
  );
  const mine = useMemo(
    () => ownFirstDefault(savedSignatures, defaultId),
    [savedSignatures, defaultId],
  );
  const shared = useMemo(
    () => savedSignatures.filter((sig) => sig.scope === "shared"),
    [savedSignatures],
  );

  async function save(
    created: CreatedSignature,
    choice: SaveChoice,
  ): Promise<WalletEntry | null> {
    if (created.initials && maxLimit - ownCount >= 2) {
      await addSignature(
        { type: "text", ...created.initials },
        uniqueName(t("sign.wallet.defaultName.initials", "Initials"), labels),
        choice.scope,
      );
    }
    const result = await addSignature(
      createdToPayload(created),
      choice.label,
      choice.scope,
    );
    if (!result.success) {
      alert({
        alertType: "error",
        title: t(
          "sign.wallet.toast.saveFailed",
          "Could not save the signature",
        ),
        body: t(
          "sign.wallet.toast.saveFailedBody",
          "It is still ready to place on this document.",
        ),
      });
      return null;
    }
    if (choice.makeDefault) setDefaultId(result.signature.id);
    alert({
      alertType: "success",
      title: t("sign.wallet.toast.saved", "Saved to your signatures"),
    });
    return toWalletEntry(result.signature);
  }

  function keepUnsaved(created: CreatedSignature, label: string): WalletEntry {
    const entry = {
      key: DRAFT_KEY,
      label,
      dataUrl: created.dataUrl,
      type: created.type,
      created,
    };
    setDraft(entry);
    return entry;
  }

  async function saveDraft(): Promise<WalletEntry | null> {
    if (!draft?.created) return null;
    const entry = await save(draft.created, {
      label: uniqueName(draft.label, labels),
      scope: "personal",
      makeDefault: false,
    });
    if (entry) setDraft(null);
    return entry;
  }

  async function shareWithEveryone(
    signature: SavedSignature,
  ): Promise<WalletEntry | null> {
    const result = await addSignature(
      savedToPayload(signature),
      signature.label,
      "shared",
    );
    if (!result.success) {
      alert({
        alertType: "error",
        title: t(
          "sign.wallet.toast.shareFailed",
          "Could not share the signature",
        ),
      });
      return null;
    }
    await removeSignature(signature.id);
    if (defaultId === signature.id) setDefaultId(result.signature.id);
    alert({
      alertType: "success",
      title: t("sign.wallet.toast.shared", "Shared with everyone"),
    });
    return toWalletEntry(result.signature);
  }

  async function remove(signature: SavedSignature) {
    if (defaultId === signature.id) setDefaultId(null);
    await removeSignature(signature.id);
  }

  async function rename(signature: SavedSignature, label: string) {
    const next = label.trim();
    if (next && next !== signature.label) {
      await updateSignatureLabel(signature.id, next);
    }
  }

  function toggleDefault(signature: SavedSignature) {
    setDefaultId(defaultId === signature.id ? null : signature.id);
  }

  function labelForImage(imageSrc: string | undefined): string | null {
    if (!imageSrc) return null;
    if (draft?.dataUrl === imageSrc) return draft.label;
    return (
      savedSignatures.find((sig) => sig.dataUrl === imageSrc)?.label ?? null
    );
  }

  function entryFor(key: string | null): WalletEntry | null {
    if (!key) return null;
    if (draft?.key === key) return draft;
    const signature = savedSignatures.find((sig) => sig.id === key);
    return signature ? toWalletEntry(signature) : null;
  }

  const defaultSignature = savedSignatures.find((sig) => sig.id === defaultId);

  return {
    isLoading,
    isEmpty: !isLoading && savedSignatures.length === 0 && !draft,
    mine,
    shared,
    draft,
    defaultId,
    defaultEntry: defaultSignature ? toWalletEntry(defaultSignature) : null,
    labels,
    count: ownCount,
    maxLimit,
    isFull: isAtCapacity,
    isAdmin,
    canShare: storageType === "backend" && isAdmin,
    browserStorage: storageType === "localStorage",
    save,
    keepUnsaved,
    saveDraft,
    discardDraft: () => setDraft(null),
    shareWithEveryone,
    remove,
    rename,
    toggleDefault,
    entryFor,
    labelForImage,
  };
}

export type SignatureLibrary = ReturnType<typeof useSignatureLibrary>;
