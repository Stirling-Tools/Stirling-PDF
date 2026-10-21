import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { FocusTrap } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import type { Rectangle } from "@app/utils/cropCoordinates";
import type { CropPageGeometry } from "@app/utils/cropPageGeometry";
import CropCanvas, {
  type CropUnit,
} from "@app/components/tools/crop/CropCanvas";
import CropMarginInputs from "@app/components/tools/crop/CropMarginInputs";
import CropRatioPicker, {
  type CropRatioId,
} from "@app/components/tools/crop/CropRatioPicker";
import classes from "@app/components/tools/crop/CropEditorOverlay.module.css";

interface CropEditorOverlayProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string | null;
  geometry: CropPageGeometry;
  cropArea: Rectangle;
  onCropAreaChange: (area: Rectangle) => void;
  aspectRatio: number | null;
  ratioId: CropRatioId;
  onRatioChange: (id: CropRatioId) => void;
  unit: CropUnit;
  onUnitChange: (unit: CropUnit) => void;
  onReset: () => void;
  disabled?: boolean;
}

/**
 * Immersive crop editing. Changes apply live, so the only exit is "Done"; a
 * draft/commit pair here would hide the result the user is judging.
 */
export default function CropEditorOverlay({
  open,
  onClose,
  imageUrl,
  geometry,
  cropArea,
  onCropAreaChange,
  aspectRatio,
  ratioId,
  onRatioChange,
  unit,
  onUnitChange,
  onReset,
  disabled = false,
}: CropEditorOverlayProps) {
  const { t } = useTranslation();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={classes.backdrop} role="presentation">
      <FocusTrap active>
        <div
          className={classes.editor}
          data-testid="crop-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <header className={classes.header}>
            <div className={classes.headerText}>
              <div id={titleId} className={classes.title}>
                {t("crop.editor.title", "Adjust crop area")}
              </div>
              <div className={classes.subtitle}>
                {t(
                  "crop.editor.subtitle",
                  "Drag a handle to trim. Pinch or scroll to zoom.",
                )}
              </div>
            </div>
            <Button
              className={classes.headerAction}
              variant="primary"
              size="sm"
              leftSection={<Icon name="check" size={16} />}
              onClick={onClose}
            >
              {t("crop.editor.done", "Done")}
            </Button>
          </header>

          <div className={classes.body}>
            <div className={classes.canvasArea}>
              <CropCanvas
                expanded
                imageUrl={imageUrl}
                geometry={geometry}
                cropArea={cropArea}
                onCropAreaChange={onCropAreaChange}
                aspectRatio={aspectRatio}
                disabled={disabled}
                unit={unit}
                ariaLabel={t(
                  "crop.canvas.ariaLabel",
                  "Crop area editor. Drag a handle to resize, drag inside to move, arrow keys nudge, Shift plus arrow keys resize.",
                )}
              />
            </div>

            <aside className={classes.panel}>
              <CropRatioPicker
                value={ratioId}
                onChange={onRatioChange}
                disabled={disabled}
              />
              <CropMarginInputs
                cropArea={cropArea}
                geometry={geometry}
                onChange={onCropAreaChange}
                unit={unit}
                onUnitChange={onUnitChange}
                disabled={disabled}
              />
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                leftSection={<Icon name="rotate-ccw" size={16} />}
                onClick={onReset}
              >
                {t("crop.reset", "Reset to full page")}
              </Button>
            </aside>
          </div>
        </div>
      </FocusTrap>
    </div>,
    document.body,
  );
}
