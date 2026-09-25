import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import MobileTransferModal from "@app/components/shared/MobileTransferModal";

/**
 * What the phone sent, routed to the matching signature source: ink and
 * photos as pixels, typed signatures as data so they stay editable text.
 */
export type MobileSignaturePayload =
  | { kind: "draw"; dataUrl: string }
  | { kind: "photo"; dataUrl: string }
  | { kind: "text"; text: string; fontFamily: string; color: string };

/** Fonts the sign tool's text mode offers; anything else falls back. */
const TEXT_FONTS = new Set([
  "Helvetica",
  "Times-Roman",
  "Courier",
  "Arial",
  "Georgia",
]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_TEXT_LENGTH = 200;

interface MobileSignatureModalProps {
  opened: boolean;
  onClose: () => void;
  onSignatureReceived: (payload: MobileSignaturePayload) => void;
}

/** FileReader-based (rather than File.text/arrayBuffer, absent in jsdom). */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
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

  // The session endpoints accept any upload from anyone holding the QR URL,
  // so nothing here is trusted: images pass as pixels, a typed signature is
  // parsed and clamped field by field, everything else is ignored.
  const handleFileReceived = useCallback(
    async (file: File) => {
      if (
        file.type === "application/json" &&
        file.name.startsWith("signature-text")
      ) {
        try {
          const parsed: unknown = JSON.parse(await readFileAsText(file));
          const record = parsed as Record<string, unknown>;
          const text =
            typeof record?.text === "string"
              ? record.text.trim().slice(0, MAX_TEXT_LENGTH)
              : "";
          if (!text) return;
          onSignatureReceived({
            kind: "text",
            text,
            fontFamily: TEXT_FONTS.has(record.fontFamily as string)
              ? (record.fontFamily as string)
              : "Helvetica",
            color: HEX_COLOR.test(record.color as string)
              ? (record.color as string)
              : "#000000",
          });
          onClose();
        } catch {
          console.warn(
            "[MobileSignatureModal] Ignoring malformed text payload",
          );
        }
        return;
      }

      if (!file.type.startsWith("image/")) {
        console.warn(
          "[MobileSignatureModal] Ignoring non-image upload:",
          file.type,
        );
        return;
      }

      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result;
          if (typeof dataUrl === "string") {
            onSignatureReceived({
              kind: file.name.startsWith("signature-photo") ? "photo" : "draw",
              dataUrl,
            });
            onClose();
          }
          resolve();
        };
        reader.onerror = () => resolve();
        reader.readAsDataURL(file);
      });
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
