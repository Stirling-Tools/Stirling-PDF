import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@app/ui/Checkbox";
import { FormField } from "@app/ui/FormField";
import { Input } from "@app/ui/Input";
import {
  deriveInitials,
  renderTypedSignature,
} from "@app/utils/signatureImage";
import { InkSwatches } from "@app/components/tools/sign/createSignature/InkSwatches";
import { SignatureStylePicker } from "@app/components/tools/sign/createSignature/SignatureStylePicker";
import {
  DEFAULT_INK,
  SIGNATURE_FONTS,
  type InkColor,
  type SignatureFont,
} from "@app/components/tools/sign/createSignature/signatureStyles";
import type {
  CreatedSignature,
  TypePanelHandle,
  TypedSignatureSource,
} from "@app/components/tools/sign/createSignature/types";
import styles from "@app/components/tools/sign/createSignature/TypeSignaturePanel.module.css";

const RENDER_FONT_SIZE = 120;

async function renderSource(
  source: TypedSignatureSource,
): Promise<string | null> {
  return renderTypedSignature({
    text: source.signerName,
    fontFamily: source.fontFamily,
    color: source.textColor,
    fontSize: source.fontSize,
  });
}

interface TypeSignaturePanelProps {
  onReadyChange: (ready: boolean) => void;
  saveEnabled: boolean;
}

export const TypeSignaturePanel = forwardRef<
  TypePanelHandle,
  TypeSignaturePanelProps
>(function TypeSignaturePanel({ onReadyChange, saveEnabled }, ref) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [initialsOverride, setInitialsOverride] = useState<string | null>(null);
  const [font, setFont] = useState<SignatureFont>(SIGNATURE_FONTS[0]);
  const [ink, setInk] = useState<InkColor>(DEFAULT_INK);
  const [includeInitials, setIncludeInitials] = useState(true);

  const initials = initialsOverride ?? deriveInitials(name);
  const hasName = name.trim().length > 0;
  const savesInitials =
    saveEnabled && includeInitials && Boolean(initials.trim());

  useEffect(() => onReadyChange(hasName), [hasName, onReadyChange]);

  async function getResult(): Promise<CreatedSignature | null> {
    const style = {
      fontFamily: font.family,
      fontSize: RENDER_FONT_SIZE,
      textColor: ink.value,
    };
    const text = { signerName: name.trim(), ...style };
    const dataUrl = await renderSource(text);
    if (!dataUrl) return null;
    const initialsSource = { signerName: initials.trim(), ...style };
    const initialsUrl = savesInitials
      ? await renderSource(initialsSource)
      : null;
    return {
      source: "type",
      type: "text",
      dataUrl,
      text,
      initials: initialsUrl
        ? { ...initialsSource, dataUrl: initialsUrl }
        : undefined,
    };
  }

  useImperativeHandle(ref, () => ({ setName, getResult }));

  return (
    <div className={styles.panel}>
      <div className={styles.nameRow}>
        <FormField label={t("sign.wallet.type.name", "Your name")}>
          <Input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder={t(
              "sign.wallet.type.namePlaceholder",
              "Type your name",
            )}
            maxLength={80}
            data-testid="signature-type-name"
          />
        </FormField>
        <FormField label={t("sign.wallet.type.initials", "Initials")}>
          <Input
            value={initials}
            onChange={(event) => setInitialsOverride(event.currentTarget.value)}
            maxLength={6}
          />
        </FormField>
      </div>
      <SignatureStylePicker
        text={name}
        ink={ink.value}
        value={font}
        onChange={setFont}
      />
      <div className={styles.footer}>
        <InkSwatches value={ink} onChange={setInk} />
        <Checkbox
          label={t("sign.wallet.type.saveInitials", "Also save my initials")}
          checked={savesInitials}
          disabled={!saveEnabled || !initials.trim()}
          onChange={(event) => setIncludeInitials(event.currentTarget.checked)}
        />
      </div>
    </div>
  );
});
