import { useTranslation } from "react-i18next";
import type { Rectangle } from "@app/utils/cropCoordinates";
import {
  getDisplaySize,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";
import classes from "@app/components/tools/crop/CropResultView.module.css";

interface CropResultViewProps {
  imageUrl: string | null;
  geometry: CropPageGeometry;
  cropArea: Rectangle;
}

/**
 * What the crop will produce, at the largest size the surface allows. Uses the
 * page bitmap as a background so it costs one element and no second decode of
 * the PDF; changing a margin repositions the same image.
 */
export default function CropResultView({
  imageUrl,
  geometry,
  cropArea,
}: CropResultViewProps) {
  const { t } = useTranslation();
  const page = getDisplaySize(geometry);
  const display = pageRectToDisplay(cropArea, geometry);
  const pageWidth = Math.max(page.width, 0.001);
  const pageHeight = Math.max(page.height, 0.001);
  const ratioWidth = Math.min(Math.max(display.width / pageWidth, 0.001), 1);
  const ratioHeight = Math.min(Math.max(display.height / pageHeight, 0.001), 1);
  const offsetX = display.x / pageWidth;
  const offsetY = display.y / pageHeight;
  const positionX =
    ratioWidth >= 0.999
      ? 0
      : (offsetX / Math.max(1 - ratioWidth, 0.0001)) * 100;
  const positionY =
    ratioHeight >= 0.999
      ? 0
      : (offsetY / Math.max(1 - ratioHeight, 0.0001)) * 100;

  return (
    <div className={classes.viewport} data-testid="crop-result-view">
      <div
        className={classes.sheet}
        style={{
          aspectRatio: `${Math.max(display.width, 0.001)} / ${Math.max(
            display.height,
            0.001,
          )}`,
          backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
          backgroundSize: `${100 / ratioWidth}% auto`,
          backgroundPosition: `${positionX}% ${positionY}%`,
        }}
        aria-hidden="true"
      />
      <span className={classes.badge}>
        {t("crop.preview.result", "Result")}
      </span>
    </div>
  );
}
