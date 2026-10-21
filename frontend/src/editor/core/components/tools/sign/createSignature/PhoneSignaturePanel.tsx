import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { useMobileTransferSession } from "@app/hooks/useMobileTransferSession";
import { Banner } from "@app/ui/Banner";
import { Icon } from "@app/ui/Icon";
import type { MobileSignaturePayload } from "@app/components/tools/sign/MobileSignatureModal";
import { parseMobileSignatureFile } from "@app/components/tools/sign/parseMobileSignatureFile";
import { TransparentPreview } from "@app/components/tools/sign/createSignature/TransparentPreview";
import styles from "@app/components/tools/sign/createSignature/PhoneSignaturePanel.module.css";

interface PhoneSignaturePanelProps {
  active: boolean;
  received: string | null;
  onReceived: (payload: MobileSignaturePayload) => Promise<void>;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function PhoneSignaturePanel({
  active,
  received,
  onReceived,
}: PhoneSignaturePanelProps) {
  const { t } = useTranslation();
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const regenerateRef = useRef<() => void>(() => {});

  const handleFile = useCallback(
    async (file: File) => {
      const payload = await parseMobileSignatureFile(file);
      if (!payload) return;
      try {
        await onReceived(payload);
        setReceiveError(null);
      } catch (err) {
        console.error("[PhoneSignaturePanel] could not use signature:", err);
        setReceiveError(
          t(
            "sign.wallet.phone.receiveFailed",
            "Could not read that signature. Scan the new code to try again.",
          ),
        );
        // Fresh session so the phone can send again.
        regenerateRef.current();
      }
    },
    [onReceived, t],
  );

  const { mobileUrl, error, timeRemaining, regenerateSession } =
    useMobileTransferSession({
      active: active && !received,
      routePath: "mobile-sign",
      onFileReceived: handleFile,
      sessionCreateErrorMessage: t(
        "sign.mobile.sessionCreateError",
        "Failed to create session",
      ),
      pollingErrorMessage: t(
        "sign.mobile.pollingError",
        "Error checking for the signature",
      ),
    });
  regenerateRef.current = regenerateSession;

  const shownError = receiveError ?? error;

  if (received) {
    return (
      <div className={styles.received}>
        <TransparentPreview
          src={received}
          label={t("sign.wallet.phone.received", "Received from your phone")}
        />
        <Banner
          tone="success"
          icon={<Icon name="circle-check" size={16} />}
          description={t(
            "sign.wallet.phone.received",
            "Received from your phone",
          )}
        />
      </div>
    );
  }

  const steps = [
    {
      title: t(
        "sign.wallet.phone.step1",
        "Scan the code with your phone camera",
      ),
      hint: t(
        "sign.wallet.phone.step1Hint",
        "It opens in the phone browser, no app needed.",
      ),
    },
    {
      title: t(
        "sign.wallet.phone.step2",
        "Draw, type or photograph your signature",
      ),
      hint: t("sign.wallet.phone.step2Hint", "A big canvas made for a finger."),
    },
    {
      title: t("sign.wallet.phone.step3", "It appears here automatically"),
      hint: t(
        "sign.wallet.phone.step3Hint",
        "Keep this window open while you sign.",
      ),
    },
  ];

  return (
    <div className={styles.layout}>
      <div className={styles.qrCard}>
        {active && (
          <QRCodeSVG
            value={mobileUrl}
            size={176}
            level="H"
            title={t("sign.wallet.phone.qr", "QR code to sign on your phone")}
          />
        )}
        {timeRemaining !== null && (
          <span className={styles.expiry}>
            {t("sign.wallet.phone.expires", "Expires in {{time}}", {
              time: formatRemaining(timeRemaining),
            })}
          </span>
        )}
      </div>
      <div className={styles.side}>
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber}>{index + 1}</span>
              <div>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepHint}>{step.hint}</div>
              </div>
            </li>
          ))}
        </ol>
        <Banner
          tone={shownError ? "danger" : "info"}
          icon={
            <Icon name={shownError ? "circle-alert" : "refresh-cw"} size={16} />
          }
          description={
            shownError ??
            t("sign.wallet.phone.waiting", "Waiting for your phone...")
          }
        />
      </div>
    </div>
  );
}
