import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import MobileTransferModal from "@app/components/shared/MobileTransferModal";
import { parseMobileSignatureFile } from "@app/components/tools/sign/parseMobileSignatureFile";

/**
 * What the phone sent, routed to the matching signature source: ink and
 * photos as pixels, typed signatures as data so they stay editable text.
 */
export type MobileSignaturePayload =
  | { kind: "draw"; dataUrl: string }
  | { kind: "photo"; dataUrl: string }
  | { kind: "text"; text: string; fontFamily: string; color: string };

interface MobileSignatureModalProps {
  opened: boolean;
  onClose: () => void;
  onSignatureReceived: (payload: MobileSignaturePayload) => void;
}

/**
 * QR modal for creating a signature on a phone or tablet. The phone opens the
 * public `/mobile-sign` page; the first valid arrival becomes the signature
 * and the modal closes.
 */
export default function MobileSignatureModal({
  opened,
  onClose,
  onSignatureReceived,
}: MobileSignatureModalProps) {
  const { t } = useTranslation();

  const handleFileReceived = useCallback(
    async (file: File) => {
      const payload = await parseMobileSignatureFile(file);
      if (payload) {
        onSignatureReceived(payload);
        onClose();
      }
    },
    [onSignatureReceived, onClose],
  );

  return (
    <MobileTransferModal
      opened={opened}
      onClose={onClose}
      routePath="mobile-sign"
      onFileReceived={handleFileReceived}
      qrSize={220}
      title={t("sign.mobile.title", "Draw on your phone")}
      description={t(
        "sign.mobile.description",
        "Scan this QR code with your phone or tablet, draw your signature, and it will appear here automatically.",
      )}
      instructions={t(
        "sign.mobile.instructions",
        "Open the camera app on your phone and scan this code. Keep this window open while you draw.",
      )}
      expiryWarningTitle={t(
        "sign.mobile.expiryWarning",
        "QR Code Expiring Soon",
      )}
      formatExpiryWarning={(seconds) =>
        t(
          "sign.mobile.expiryWarningMessage",
          "This QR code will expire in {{seconds}} seconds. A new code will be generated automatically.",
          { seconds },
        )
      }
      errorTitle={t("sign.mobile.error", "Connection Error")}
      sessionCreateErrorMessage={t(
        "sign.mobile.sessionCreateError",
        "Failed to create session",
      )}
      pollingErrorMessage={t(
        "sign.mobile.pollingError",
        "Error checking for the signature",
      )}
    />
  );
}
