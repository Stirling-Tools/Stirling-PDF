import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useSignature } from "@editor/contexts/SignatureContext";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { useHistoryAvailability } from "@editor/hooks/useHistoryAvailability";
import type { SignParameters } from "@editor/hooks/tools/sign/useSignParameters";
import type { SavedSignature } from "@editor/types/signature";
import { CreateSignatureModal } from "@editor/components/tools/sign/createSignature/CreateSignatureModal";
import type { CreateTab } from "@editor/components/tools/sign/createSignature/types";
import { ApplySignaturesButton } from "@editor/components/tools/sign/wallet/ApplySignaturesButton";
import { DeleteSignatureModal } from "@editor/components/tools/sign/wallet/DeleteSignatureModal";
import { PlacedSignaturesList } from "@editor/components/tools/sign/wallet/PlacedSignaturesList";
import { PlacementStatus } from "@editor/components/tools/sign/wallet/PlacementStatus";
import { RenameSignatureModal } from "@editor/components/tools/sign/wallet/RenameSignatureModal";
import { SignatureLibraryView } from "@editor/components/tools/sign/wallet/SignatureLibraryView";
import { SignatureWalletIntro } from "@editor/components/tools/sign/wallet/SignatureWalletIntro";
import { useSignatureLibrary } from "@editor/components/tools/sign/wallet/useSignatureLibrary";
import {
  useArmDefaultSignature,
  useSignaturePlacement,
} from "@editor/components/tools/sign/wallet/useSignaturePlacement";
import { useWalletActions } from "@editor/components/tools/sign/wallet/useWalletActions";
import styles from "@editor/components/tools/sign/wallet/SignatureWallet.module.css";
import { alert } from "@editor/components/toast";

type WalletDialog =
  | { kind: "create"; tab: CreateTab }
  | { kind: "rename"; signature: SavedSignature }
  | { kind: "delete"; signature: SavedSignature }
  | null;

interface SignatureWalletProps {
  onParameterChange: <K extends keyof SignParameters>(
    key: K,
    value: SignParameters[K],
  ) => void;
  disabled?: boolean;
  applying?: boolean;
  onActivateSignaturePlacement: () => void;
  onDeactivateSignature: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
}

export function SignatureWallet({
  onParameterChange,
  disabled = false,
  applying = false,
  onActivateSignaturePlacement,
  onDeactivateSignature,
  onUndo,
  onRedo,
  onSave,
}: SignatureWalletProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  const { placedSignatures, historyApiRef } = useSignature();
  const history = useHistoryAvailability(historyApiRef);
  const library = useSignatureLibrary();
  const [dialog, setDialog] = useState<WalletDialog>(null);
  const placement = useSignaturePlacement({
    onParameterChange,
    onActivate: onActivateSignaturePlacement,
    onDeactivate: onDeactivateSignature,
  });
  const actions = useWalletActions(library, placement);
  useArmDefaultSignature(
    !library.isLoading && !disabled,
    library.defaultEntry,
    placement.arm,
  );

  const showPhone = Boolean(config?.enableMobileSignature) && !isMobile;
  const closeDialog = () => setDialog(null);
  const openCreate = (tab: CreateTab) => {
    if (library.draft) {
      alert({
        alertType: "warning",
        title: t(
          "sign.wallet.toast.draftExists",
          "Save or discard your unsaved signature first",
        ),
      });
      return;
    }
    setDialog({ kind: "create", tab });
  };

  function renderLibrary() {
    if (library.isLoading) {
      return (
        <p className={styles.loading}>
          {t("sign.wallet.loading", "Loading your signatures...")}
        </p>
      );
    }
    if (library.isEmpty) {
      return (
        <SignatureWalletIntro
          showPhone={showPhone}
          browserStorage={library.browserStorage}
          disabled={disabled}
          onCreate={openCreate}
        />
      );
    }
    return (
      <>
        <SignatureLibraryView
          library={library}
          placement={placement}
          disabled={disabled}
          onNew={() => openCreate("draw")}
          onRename={(signature) => setDialog({ kind: "rename", signature })}
          onDelete={(signature) => setDialog({ kind: "delete", signature })}
          onShare={(signature) => void actions.share(signature)}
          onSaveDraft={() => void actions.saveDraft()}
          onDiscardDraft={actions.discardDraft}
        />
        <PlacementStatus
          placing={library.entryFor(placement.placingKey)?.label ?? null}
          onStop={placement.stop}
        />
        <PlacedSignaturesList
          placed={placedSignatures}
          nameFor={(entry) =>
            library.labelForImage(entry.imageSrc) ??
            t("sign.wallet.placed.fallbackName", "Signature")
          }
          history={history}
          onUndo={onUndo}
          onRedo={onRedo}
          onShow={actions.showPlaced}
          onRemove={actions.removePlaced}
          disabled={disabled}
        />
      </>
    );
  }

  return (
    <div className={styles.wallet} data-testid="signature-wallet">
      {renderLibrary()}
      {library.isEmpty &&
        (placedSignatures.length > 0 || history.canUndo || history.canRedo) && (
          <PlacedSignaturesList
            placed={placedSignatures}
            nameFor={() => t("sign.wallet.placed.fallbackName", "Signature")}
            history={history}
            onUndo={onUndo}
            onRedo={onRedo}
            onShow={actions.showPlaced}
            onRemove={actions.removePlaced}
            disabled={disabled}
          />
        )}
      {onSave && (
        <ApplySignaturesButton
          count={placedSignatures.length}
          disabled={disabled}
          applying={applying}
          onApply={() => {
            placement.stop();
            onSave();
          }}
        />
      )}
      {dialog?.kind === "create" && (
        <CreateSignatureModal
          initialTab={dialog.tab}
          onClose={closeDialog}
          onCreate={async (created, choice) => {
            await actions.create(created, choice);
            closeDialog();
          }}
          limits={{
            canSave: !library.isFull,
            maxLimit: library.maxLimit,
            canShare: library.canShare,
            browserStorage: library.browserStorage,
            remainingSlots: library.maxLimit - library.count,
          }}
          showPhoneTab={showPhone}
          existingLabels={library.labels}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameSignatureModal
          currentName={dialog.signature.label}
          onClose={closeDialog}
          onRename={(name) => library.rename(dialog.signature, name)}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteSignatureModal
          name={dialog.signature.label}
          onClose={closeDialog}
          onConfirm={() => actions.remove(dialog.signature)}
        />
      )}
    </div>
  );
}
