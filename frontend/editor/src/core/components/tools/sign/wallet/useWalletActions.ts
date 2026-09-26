import { useTranslation } from "react-i18next";
import {
  useSignature,
  type PlacedSignature,
} from "@app/contexts/SignatureContext";
import { useViewer } from "@app/contexts/ViewerContext";
import type { SavedSignature } from "@app/types/signature";
import { PLACEMENT_ACTIVATION_DELAY } from "@app/constants/signConstants";
import { uniqueName } from "@app/utils/uniqueName";
import { defaultSignatureName } from "@app/components/tools/sign/createSignature/createTabs";
import type {
  CreatedSignature,
  SaveChoice,
} from "@app/components/tools/sign/createSignature/types";
import type { SignatureLibrary } from "@app/components/tools/sign/wallet/useSignatureLibrary";
import type { SignaturePlacement } from "@app/components/tools/sign/wallet/useSignaturePlacement";
import { DRAFT_KEY } from "@app/components/tools/sign/wallet/walletEntry";

export function useWalletActions(
  library: SignatureLibrary,
  placement: SignaturePlacement,
) {
  const { t } = useTranslation();
  const { signatureApiRef } = useSignature();
  const { scrollActions } = useViewer();

  async function create(created: CreatedSignature, choice: SaveChoice | null) {
    const saved = choice ? await library.save(created, choice) : null;
    const label =
      choice?.label ??
      uniqueName(defaultSignatureName(t, created.source), library.labels);
    placement.arm(saved ?? library.keepUnsaved(created, label));
  }

  async function saveDraft() {
    const saved = await library.saveDraft();
    if (saved && placement.placingKey === DRAFT_KEY) placement.rekey(saved.key);
  }

  function discardDraft() {
    if (placement.placingKey === DRAFT_KEY) placement.stop();
    library.discardDraft();
  }

  async function share(signature: SavedSignature) {
    const shared = await library.shareWithEveryone(signature);
    if (shared && placement.placingKey === signature.id)
      placement.rekey(shared.key);
  }

  async function remove(signature: SavedSignature) {
    if (placement.placingKey === signature.id) placement.stop();
    await library.remove(signature);
  }

  function showPlaced(entry: PlacedSignature) {
    placement.stop();
    scrollActions.scrollToPage(entry.pageIndex + 1);
    window.setTimeout(
      () =>
        signatureApiRef.current?.selectAnnotation(entry.id, entry.pageIndex),
      PLACEMENT_ACTIVATION_DELAY,
    );
  }

  function removePlaced(entry: PlacedSignature) {
    signatureApiRef.current?.deleteAnnotation(entry.id, entry.pageIndex);
  }

  return {
    create,
    saveDraft,
    discardDraft,
    share,
    remove,
    showPlaced,
    removePlaced,
  };
}
