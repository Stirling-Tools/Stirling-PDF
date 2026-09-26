import { useCallback } from "react";
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
  onReceived: (payload: MobileSignaturePayload) => void;
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

  const handleFile = useCallback(
    async (file: File) => {
      const payload = await parseMobileSignatureFile(file);
      if (payload) onReceived(payload);
    },
    [onReceived],
  );

  const { mobileUrl, error, timeRemaining } = useMobileTransferSession({
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
          tone={error ? "danger" : "info"}
          icon={<Icon name={error ? "circle-alert" : "refresh-cw"} size={16} />}
          description={
            error ?? t("sign.wallet.phone.waiting", "Waiting for your phone...")
          }
        />
      </div>
    </div>
  );
}
