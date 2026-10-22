import { Box, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { Rectangle } from "@app/utils/cropCoordinates";
import {
  MM_PER_POINT,
  getDisplaySize,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";
import type { CropUnit } from "@app/components/tools/crop/CropCanvas";
import classes from "@app/components/tools/crop/CropResultPreview.module.css";

interface CropResultPreviewProps {
  imageUrl: string | null;
  geometry: CropPageGeometry;
  cropArea: Rectangle;
  unit: CropUnit;
  ratioLabel?: string;
}

const THUMB = 96;

/**
 * WYSIWYG preview of the crop: the page image is scaled so exactly the crop
 * rectangle fills the thumb, which makes the result legible without applying
 * the operation.
 */
export default function CropResultPreview({
  imageUrl,
  geometry,
  cropArea,
  unit,
  ratioLabel,
}: CropResultPreviewProps) {
  const { t } = useTranslation();
  const page = getDisplaySize(geometry);
  const display = pageRectToDisplay(cropArea, geometry);
  const pageWidth = Math.max(page.width, 0.001);
  const pageHeight = Math.max(page.height, 0.001);
  const ratioWidth = Math.min(Math.max(display.width / pageWidth, 0.001), 1);
  const ratioHeight = Math.min(Math.max(display.height / pageHeight, 0.001), 1);

  const cropAspect = display.height > 0 ? display.width / display.height : 1;
  const boxWidth = cropAspect >= 1 ? THUMB : THUMB * cropAspect;
  const boxHeight = cropAspect >= 1 ? THUMB / cropAspect : THUMB;

  const fullWidth = boxWidth / ratioWidth;
  const fullHeight = fullWidth * (pageHeight / pageWidth);
  const backgroundX = -(display.x / pageWidth) * fullWidth;
  const backgroundY = -(display.y / pageHeight) * fullHeight;

  const widthPoints = display.width;
  const heightPoints = display.height;
  const widthValue = unit === "pt" ? widthPoints : widthPoints * MM_PER_POINT;
  const heightValue =
    unit === "pt" ? heightPoints : heightPoints * MM_PER_POINT;
  const percent = Math.round(ratioWidth * ratioHeight * 100);

  return (
    <Box className={classes.result} data-testid="crop-result">
      <div className={classes.thumbOuter}>
        <div
          className={classes.thumb}
          style={{
            width: `${boxWidth}px`,
            height: `${boxHeight}px`,
            backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
            backgroundSize: `${fullWidth}px ${fullHeight}px`,
            backgroundPosition: `${backgroundX}px ${backgroundY}px`,
          }}
          aria-hidden="true"
        />
      </div>
      <div className={classes.meta}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          {t("crop.result.title", "Result")}
        </Text>
        <Text
          size="sm"
          fw={600}
          className={classes.size}
          data-testid="crop-result-size"
        >
          {widthValue.toFixed(widthValue >= 10 ? 0 : 1)} ×{" "}
          {heightValue.toFixed(heightValue >= 10 ? 0 : 1)} {unit}
        </Text>
        <Text size="xs" c="dimmed">
          {t("crop.result.ofPage", "{{percent}}% of page", { percent })}
          {ratioLabel ? ` · ${ratioLabel}` : ""}
        </Text>
      </div>
    </Box>
  );
}
