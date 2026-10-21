import { useEffect, useRef, useState } from "react";
import { Group, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import type { Rectangle } from "@app/utils/cropCoordinates";
import {
  MM_PER_POINT,
  MIN_CROP_POINTS,
  clampPageRect,
  displayRectToPage,
  getDisplaySize,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";
import type { CropUnit } from "@app/components/tools/crop/CropCanvas";
import classes from "@app/components/tools/crop/CropMarginInputs.module.css";

type Edge = "top" | "right" | "bottom" | "left";

const EDGE_ORDER: Edge[] = ["top", "right", "bottom", "left"];

interface CropMarginInputsProps {
  cropArea: Rectangle;
  geometry: CropPageGeometry;
  onChange: (area: Rectangle) => void;
  unit: CropUnit;
  onUnitChange: (unit: CropUnit) => void;
  disabled?: boolean;
}

const toUnit = (points: number, unit: CropUnit): number =>
  Math.round((unit === "pt" ? points : points * MM_PER_POINT) * 10) / 10;

const fromUnit = (value: number, unit: CropUnit): number =>
  unit === "pt" ? value : value / MM_PER_POINT;

/**
 * Margin-first editor: people trim edges, they do not think in absolute
 * bottom-left coordinates. Values are display-oriented, so a rotated page
 * still presents top as the top the user can see.
 */
export default function CropMarginInputs({
  cropArea,
  geometry,
  onChange,
  unit,
  onUnitChange,
  disabled = false,
}: CropMarginInputsProps) {
  const { t } = useTranslation();
  const [equal, setEqual] = useState(false);
  const displaySize = getDisplaySize(geometry);
  const display = pageRectToDisplay(cropArea, geometry);

  const margins = {
    top: display.y,
    right: displaySize.width - (display.x + display.width),
    bottom: displaySize.height - (display.y + display.height),
    left: display.x,
  };

  const commitDisplay = (rect: Rectangle) => {
    if (rect.width < MIN_CROP_POINTS || rect.height < MIN_CROP_POINTS) {
      return;
    }
    onChange(clampPageRect(displayRectToPage(rect, geometry), geometry));
  };

  const setEdge = (edge: Edge, value: number) => {
    const points = fromUnit(value, unit);

    if (equal) {
      const limit = Math.min(displaySize.width, displaySize.height) / 2;
      const margin = Math.min(Math.max(points, 0), limit - MIN_CROP_POINTS);
      commitDisplay({
        x: margin,
        y: margin,
        width: displaySize.width - margin * 2,
        height: displaySize.height - margin * 2,
      });
      return;
    }

    const left = display.x;
    const top = display.y;
    const right = displaySize.width - display.x - display.width;
    const bottom = displaySize.height - display.y - display.height;

    switch (edge) {
      case "left":
        commitDisplay({
          x: points,
          y: top,
          width: displaySize.width - right - points,
          height: display.height,
        });
        break;
      case "right":
        commitDisplay({
          x: left,
          y: top,
          width: displaySize.width - points - left,
          height: display.height,
        });
        break;
      case "top":
        commitDisplay({
          x: left,
          y: points,
          width: display.width,
          height: displaySize.height - bottom - points,
        });
        break;
      case "bottom":
        commitDisplay({
          x: left,
          y: top,
          width: display.width,
          height: displaySize.height - points - top,
        });
        break;
    }
  };

  const unitOptions = [
    { label: t("crop.units.mm", "mm"), value: "mm" as const },
    { label: t("crop.units.pt", "pt"), value: "pt" as const },
  ];

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          {t("crop.margins.title", "Margins")}
        </Text>
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            variant={equal ? "primary" : "quiet"}
            accent="neutral"
            size="sm"
            aria-label={t("crop.margins.equal", "Equal margins")}
            aria-pressed={equal}
            title={t("crop.margins.equal", "Equal margins")}
            onClick={() => setEqual((previous) => !previous)}
            disabled={disabled}
          >
            <Icon name="lock" size="0.75rem" />
          </ActionIcon>
          <SegmentedControl
            options={unitOptions}
            value={unit}
            onChange={onUnitChange}
            size="xs"
            ariaLabel={t("crop.units.label", "Measurement unit")}
            disabled={disabled}
          />
        </Group>
      </Group>

      <div className={classes.grid}>
        {EDGE_ORDER.map((edge) => (
          <MarginField
            key={edge}
            testId={`crop-margin-${edge}`}
            label={t(`crop.margins.${edge}`, edgeLabel(edge))}
            value={toUnit(margins[edge], unit)}
            unit={unit}
            max={
              toUnit(
                (edge === "left" || edge === "right"
                  ? displaySize.width
                  : displaySize.height) - MIN_CROP_POINTS,
                unit,
              ) || 0
            }
            disabled={disabled}
            onCommit={(value) => setEdge(edge, value)}
          />
        ))}
      </div>

      <Text size="xs" c="dimmed" ta="center" className={classes.summary}>
        {t("crop.margins.size", "Crop size")}{" "}
        <strong>
          {toUnit(display.width, unit)} × {toUnit(display.height, unit)} {unit}
        </strong>
      </Text>
    </Stack>
  );
}

function edgeLabel(edge: Edge): string {
  return edge.charAt(0).toUpperCase() + edge.slice(1);
}

interface MarginFieldProps {
  testId: string;
  label: string;
  value: number;
  unit: CropUnit;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}

function MarginField({
  testId,
  label,
  value,
  unit,
  max,
  disabled,
  onCommit,
}: MarginFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(null);
  }, [value]);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number.parseFloat(draft.replace(",", "."));
    if (Number.isFinite(parsed)) {
      onCommit(Math.min(Math.max(parsed, 0), max));
    }
    setDraft(null);
  };

  return (
    <TextInput
      ref={inputRef}
      data-testid={testId}
      label={label}
      size="xs"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={draft ?? String(value)}
      disabled={disabled}
      rightSectionWidth={30}
      rightSection={
        <Text size="xs" c="dimmed">
          {unit}
        </Text>
      }
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
