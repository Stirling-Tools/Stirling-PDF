import { useTranslation } from "react-i18next";
import type { SavedSignature } from "@app/types/signature";
import { SignatureSection } from "@app/components/tools/sign/wallet/SignatureSection";
import {
  NewSignatureTile,
  SignatureTile,
} from "@app/components/tools/sign/wallet/SignatureTile";
import {
  draftSignatureActions,
  savedSignatureActions,
} from "@app/components/tools/sign/wallet/signatureTileActions";
import type { SignatureLibrary } from "@app/components/tools/sign/wallet/useSignatureLibrary";
import type { SignaturePlacement } from "@app/components/tools/sign/wallet/useSignaturePlacement";
import {
  DRAFT_KEY,
  toWalletEntry,
} from "@app/components/tools/sign/wallet/walletEntry";

interface SignatureLibraryViewProps {
  library: SignatureLibrary;
  placement: SignaturePlacement;
  disabled: boolean;
  onNew: () => void;
  onRename: (signature: SavedSignature) => void;
  onDelete: (signature: SavedSignature) => void;
  onShare: (signature: SavedSignature) => void;
  onSaveDraft: () => void;
  onDiscardDraft: () => void;
}

export function SignatureLibraryView({
  library,
  placement,
  disabled,
  onNew,
  onRename,
  onDelete,
  onShare,
  onSaveDraft,
  onDiscardDraft,
}: SignatureLibraryViewProps) {
  const { t } = useTranslation();
  const { draft } = library;

  function savedTile(signature: SavedSignature) {
    const entry = toWalletEntry(signature);
    const isDefault = library.defaultId === signature.id;
    const actions = savedSignatureActions(signature, {
      t,
      isPlacing: placement.placingKey === signature.id,
      isDefault,
      isAdmin: library.isAdmin,
      canShare: library.canShare,
      onPlace: () => placement.arm(entry),
      onStop: placement.stop,
      onRename: () => onRename(signature),
      onToggleDefault: () => library.toggleDefault(signature),
      onShare: () => onShare(signature),
      onDelete: () => onDelete(signature),
    });
    return (
      <SignatureTile
        key={signature.id}
        label={signature.label}
        dataUrl={signature.dataUrl}
        isDefault={isDefault}
        selected={placement.placingKey === signature.id}
        disabled={disabled}
        actions={actions}
        onClick={() => placement.toggle(entry)}
      />
    );
  }

  return (
    <>
      <SignatureSection
        title={t("sign.wallet.yours", "Your signatures")}
        meta={t("sign.wallet.count", "{{count}} of {{max}}", {
          count: library.count,
          max: library.maxLimit,
        })}
      >
        {draft && (
          <SignatureTile
            label={draft.label}
            dataUrl={draft.dataUrl}
            badge={t("sign.wallet.unsaved", "Unsaved")}
            selected={placement.placingKey === DRAFT_KEY}
            disabled={disabled}
            actions={draftSignatureActions({
              t,
              isPlacing: placement.placingKey === DRAFT_KEY,
              canSave: !library.isFull,
              onPlace: () => placement.arm(draft),
              onStop: placement.stop,
              onSave: onSaveDraft,
              onDiscard: onDiscardDraft,
            })}
            onClick={() => placement.toggle(draft)}
          />
        )}
        {library.mine.map(savedTile)}
        <NewSignatureTile
          label={t("sign.wallet.new", "New signature")}
          disabled={disabled}
          onClick={onNew}
        />
      </SignatureSection>
      {library.shared.length > 0 && (
        <SignatureSection
          title={t("sign.wallet.shared", "Shared")}
          meta={t("sign.wallet.sharedHint", "Everyone can use these")}
          icon="users"
        >
          {library.shared.map(savedTile)}
        </SignatureSection>
      )}
    </>
  );
}
