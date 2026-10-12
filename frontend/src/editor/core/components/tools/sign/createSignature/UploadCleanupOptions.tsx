import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { ToggleSwitch } from "@app/ui/ToggleSwitch";
import { INK_COLORS } from "@app/components/tools/sign/createSignature/signatureStyles";
import type { UploadCleanup } from "@app/utils/signatureImage";
import { ControlLabel } from "@app/components/tools/sign/createSignature/ControlLabel";
import styles from "@app/components/tools/sign/createSignature/UploadSignaturePanel.module.css";

export type InkChoice = "original" | "black" | "blue";

export interface CleanupSettings {
  removeBackground: boolean;
  trim: boolean;
  ink: InkChoice;
  quarterTurns: number;
}

export const DEFAULT_CLEANUP: CleanupSettings = {
  removeBackground: true,
  trim: true,
  ink: "original",
  quarterTurns: 0,
};

export function toUploadCleanup(settings: CleanupSettings): UploadCleanup {
  const ink = INK_COLORS.find((entry) => entry.id === settings.ink);
  return {
    removeBackground: settings.removeBackground,
    trim: settings.trim,
    inkColor: ink?.value ?? null,
    quarterTurns: settings.quarterTurns,
  };
}

interface UploadCleanupOptionsProps {
  value: CleanupSettings;
  onChange: (next: CleanupSettings) => void;
}

export function UploadCleanupOptions({
  value,
  onChange,
}: UploadCleanupOptionsProps) {
  const { t } = useTranslation();
  const update = (patch: Partial<CleanupSettings>) =>
    onChange({ ...value, ...patch });
  const inkOptions = [
    {
      value: "original" as const,
      label: t("sign.wallet.upload.inkOriginal", "Original"),
    },
    {
      value: "black" as const,
      label: t("sign.wallet.upload.inkBlack", "Black"),
    },
    { value: "blue" as const, label: t("sign.wallet.upload.inkBlue", "Blue") },
  ];

  return (
    <div className={styles.options}>
      <ToggleSwitch
        checked={value.removeBackground}
        onChange={(removeBackground) => update({ removeBackground })}
        label={t("sign.wallet.upload.removeBackground", "Remove background")}
        description={t(
          "sign.wallet.upload.removeBackgroundHint",
          "White paper becomes transparent",
        )}
      />
      <ToggleSwitch
        checked={value.trim}
        onChange={(trim) => update({ trim })}
        label={t("sign.wallet.upload.trim", "Trim to signature")}
        description={t(
          "sign.wallet.upload.trimHint",
          "Crops the empty space around it",
        )}
      />
      <div className={styles.option}>
        <ControlLabel>{t("sign.wallet.upload.ink", "Ink color")}</ControlLabel>
        <SegmentedControl
          options={inkOptions}
          value={value.ink}
          onChange={(ink) => update({ ink })}
          size="sm"
          fullWidth
          disabled={!value.removeBackground}
          ariaLabel={t("sign.wallet.upload.ink", "Ink color")}
        />
      </div>
      <div className={styles.rotateRow}>
        <span className={styles.grow}>
          <ControlLabel>
            {t("sign.wallet.upload.rotate", "Rotate")}
          </ControlLabel>
        </span>
        <ActionIcon
          variant="secondary"
          aria-label={t("sign.wallet.upload.rotateLeft", "Rotate left")}
          onClick={() => update({ quarterTurns: value.quarterTurns - 1 })}
        >
          <Icon name="rotate-ccw" size={16} />
        </ActionIcon>
        <ActionIcon
          variant="secondary"
          aria-label={t("sign.wallet.upload.rotateRight", "Rotate right")}
          onClick={() => update({ quarterTurns: value.quarterTurns + 1 })}
        >
          <Icon name="rotate-cw" size={16} />
        </ActionIcon>
      </div>
    </div>
  );
}
