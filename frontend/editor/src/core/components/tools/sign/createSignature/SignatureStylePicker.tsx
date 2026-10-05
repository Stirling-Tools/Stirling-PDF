import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import {
  SIGNATURE_FONTS,
  type SignatureFont,
} from "@app/components/tools/sign/createSignature/signatureStyles";
import { ControlLabel } from "@app/components/tools/sign/createSignature/ControlLabel";
import styles from "@app/components/tools/sign/createSignature/SignatureStylePicker.module.css";

const PREVIEW_FONT_SIZE = 30;

interface SignatureStylePickerProps {
  text: string;
  ink: string;
  value: SignatureFont;
  onChange: (font: SignatureFont) => void;
}

export function SignatureStylePicker({
  text,
  ink,
  value,
  onChange,
}: SignatureStylePickerProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const preview = text.trim() || t("sign.wallet.type.previewName", "Your name");

  return (
    <div className={styles.picker}>
      <ControlLabel id={labelId}>
        {t("sign.wallet.type.style", "Style")}
      </ControlLabel>
      <div className={styles.grid} role="radiogroup" aria-labelledby={labelId}>
        {SIGNATURE_FONTS.map((font, index) => (
          <button
            key={font.family}
            type="button"
            role="radio"
            aria-checked={font.family === value.family}
            aria-label={t("sign.wallet.type.styleOption", "Style {{index}}", {
              index: index + 1,
            })}
            className={styles.card}
            onClick={() => onChange(font)}
          >
            <span
              data-user-content-preview
              data-placeholder={!text.trim() || undefined}
              className={styles.preview}
              style={{
                fontFamily: `"${font.family}", cursive`,
                fontSize: PREVIEW_FONT_SIZE * font.previewScale,
                color: ink,
              }}
            >
              {preview}
            </span>
            <span className={styles.check} aria-hidden>
              <Icon name="check" size={11} strokeWidth={3.2} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
