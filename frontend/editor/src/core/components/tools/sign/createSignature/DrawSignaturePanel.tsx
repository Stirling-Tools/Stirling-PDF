import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { VisuallyHidden } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { InkSwatches } from "@app/components/tools/sign/createSignature/InkSwatches";
import {
  DEFAULT_INK,
  type InkColor,
} from "@app/components/tools/sign/createSignature/signatureStyles";
import {
  useSignaturePad,
  type PenWidth,
} from "@app/components/tools/sign/createSignature/useSignaturePad";
import type { SignaturePanelHandle } from "@app/components/tools/sign/createSignature/types";
import { ControlLabel } from "@app/components/tools/sign/createSignature/ControlLabel";
import styles from "@app/components/tools/sign/createSignature/DrawSignaturePanel.module.css";

const PEN_DOT_SIZES: Record<PenWidth, number> = {
  fine: 4,
  medium: 7,
  bold: 10,
};

interface DrawSignaturePanelProps {
  onReadyChange: (ready: boolean) => void;
}

export const DrawSignaturePanel = forwardRef<
  SignaturePanelHandle,
  DrawSignaturePanelProps
>(function DrawSignaturePanel({ onReadyChange }, ref) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ink, setInk] = useState<InkColor>(DEFAULT_INK);
  const [pen, setPen] = useState<PenWidth>("medium");
  const { strokeCount, undo, clear, toTrimmedDataUrl } = useSignaturePad(
    canvasRef,
    ink.value,
    pen,
  );
  const hasDrawing = strokeCount > 0;

  useEffect(() => onReadyChange(hasDrawing), [hasDrawing, onReadyChange]);

  useImperativeHandle(ref, () => ({
    getResult: async () => {
      const dataUrl = toTrimmedDataUrl();
      return dataUrl ? { source: "draw", type: "canvas", dataUrl } : null;
    },
  }));

  const penLabels: Record<PenWidth, string> = {
    fine: t("sign.wallet.draw.fine", "Fine pen"),
    medium: t("sign.wallet.draw.medium", "Medium pen"),
    bold: t("sign.wallet.draw.bold", "Bold pen"),
  };
  const penOptions = (Object.keys(PEN_DOT_SIZES) as PenWidth[]).map(
    (width) => ({
      value: width,
      label: (
        <>
          <span
            className={styles.penDot}
            style={{
              width: PEN_DOT_SIZES[width],
              height: PEN_DOT_SIZES[width],
            }}
          />
          <VisuallyHidden>{penLabels[width]}</VisuallyHidden>
        </>
      ),
    }),
  );

  return (
    <div className={styles.panel}>
      <div className={styles.pad}>
        <span className={styles.cross} aria-hidden>
          ×
        </span>
        <span className={styles.baseline} aria-hidden />
        {!hasDrawing && (
          <span className={styles.hint} aria-hidden>
            {t("sign.wallet.draw.hint", "Sign above the line")}
          </span>
        )}
        <PrivateContent>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label={t("sign.wallet.draw.pad", "Signature pad")}
            data-testid="signature-draw-pad"
          />
        </PrivateContent>
        <div className={styles.padTools}>
          <Button
            variant="secondary"
            size="sm"
            leftSection={<Icon name="undo-2" size={14} />}
            onClick={undo}
            disabled={!hasDrawing}
          >
            {t("sign.wallet.draw.undo", "Undo")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftSection={<Icon name="eraser" size={14} />}
            onClick={clear}
            disabled={!hasDrawing}
          >
            {t("sign.wallet.draw.clear", "Clear")}
          </Button>
        </div>
      </div>
      <div className={styles.controls}>
        <InkSwatches value={ink} onChange={setInk} />
        <div className={styles.penGroup}>
          <ControlLabel>{t("sign.wallet.draw.pen", "Pen")}</ControlLabel>
          <SegmentedControl
            options={penOptions}
            value={pen}
            onChange={setPen}
            size="xs"
            ariaLabel={t("sign.wallet.draw.pen", "Pen")}
          />
        </div>
        <span className={styles.tip}>
          <Icon name="info" size={14} />
          {t("sign.wallet.draw.tip", "Use a mouse, trackpad, pen or finger")}
        </span>
      </div>
    </div>
  );
});
