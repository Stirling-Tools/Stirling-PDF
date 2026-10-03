import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  INK_COLORS,
  type InkColor,
} from "@app/components/tools/sign/createSignature/signatureStyles";
import { ControlLabel } from "@app/components/tools/sign/createSignature/ControlLabel";
import styles from "@app/components/tools/sign/createSignature/InkSwatches.module.css";

interface InkSwatchesProps {
  value: InkColor;
  onChange: (ink: InkColor) => void;
}

export function InkSwatches({ value, onChange }: InkSwatchesProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const names: Record<InkColor["id"], string> = {
    black: t("sign.wallet.ink.black", "Black ink"),
    navy: t("sign.wallet.ink.navy", "Navy ink"),
    blue: t("sign.wallet.ink.blue", "Blue ink"),
  };

  return (
    <div className={styles.group}>
      <ControlLabel id={labelId}>
        {t("sign.wallet.ink.label", "Ink")}
      </ControlLabel>
      <div role="radiogroup" aria-labelledby={labelId} className={styles.group}>
        {INK_COLORS.map((ink) => (
          <button
            key={ink.id}
            type="button"
            role="radio"
            aria-checked={value.id === ink.id}
            aria-label={names[ink.id]}
            className={styles.swatch}
            style={{ background: ink.value }}
            onClick={() => onChange(ink)}
          />
        ))}
      </div>
    </div>
  );
}
