import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSignature } from "@app/contexts/SignatureContext";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useHistoryAvailability } from "@app/hooks/useHistoryAvailability";
import type { SignParameters } from "@app/hooks/tools/sign/useSignParameters";
import type { SavedSignature } from "@app/types/signature";
import { CreateSignatureModal } from "@app/components/tools/sign/createSignature/CreateSignatureModal";
import type { CreateTab } from "@app/components/tools/sign/createSignature/types";
import { ApplySignaturesButton } from "@app/components/tools/sign/wallet/ApplySignaturesButton";
import { DeleteSignatureModal } from "@app/components/tools/sign/wallet/DeleteSignatureModal";
import { PlacedSignaturesList } from "@app/components/tools/sign/wallet/PlacedSignaturesList";
import { PlacementStatus } from "@app/components/tools/sign/wallet/PlacementStatus";
import { RenameSignatureModal } from "@app/components/tools/sign/wallet/RenameSignatureModal";
import { SignatureLibraryView } from "@app/components/tools/sign/wallet/SignatureLibraryView";
import { SignatureWalletIntro } from "@app/components/tools/sign/wallet/SignatureWalletIntro";
import { useSignatureLibrary } from "@app/components/tools/sign/wallet/useSignatureLibrary";
import {
  useArmDefaultSignature,
  useSignaturePlacement,
} from "@app/components/tools/sign/wallet/useSignaturePlacement";
import { useWalletActions } from "@app/components/tools/sign/wallet/useWalletActions";
import styles from "@app/components/tools/sign/wallet/SignatureWallet.module.css";

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
  onActivateSignaturePlacement: () => void;
  onDeactivateSignature: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
}

export function SignatureWallet({
  onParameterChange,
  disabled = false,
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
  const history = useHistoryAvailability(historyApiRef.current);
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
  const openCreate = (tab: CreateTab) => setDialog({ kind: "create", tab });

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
        />
      </>
    );
  }

  return (
    <div className={styles.wallet} data-testid="signature-wallet">
      {renderLibrary()}
      {onSave && (
        <ApplySignaturesButton
          count={placedSignatures.length}
          disabled={disabled}
          onApply={onSave}
        />
      )}
      {dialog?.kind === "create" && (
        <CreateSignatureModal
          initialTab={dialog.tab}
          onClose={closeDialog}
          onCreate={async (created, choice) => {
            closeDialog();
            await actions.create(created, choice);
          }}
          limits={{
            canSave: !library.isFull,
            maxLimit: library.maxLimit,
            canShare: library.canShare,
            browserStorage: library.browserStorage,
          }}
          showPhoneTab={showPhone}
          existingLabels={library.labels}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameSignatureModal
          currentName={dialog.signature.label}
          onClose={closeDialog}
          onRename={(name) => {
            closeDialog();
            void library.rename(dialog.signature, name);
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteSignatureModal
          name={dialog.signature.label}
          onClose={closeDialog}
          onConfirm={() => {
            closeDialog();
            void actions.remove(dialog.signature);
          }}
        />
      )}
    </div>
  );
}
