import { useTranslation } from "react-i18next";
import { Group, Stack, Text } from "@mantine/core";
import { Chip } from "@app/ui/Chip";
import { Select } from "@app/ui/Select";
import type { PageSize } from "@app/utils/cropPageGeometry";
import classes from "@app/components/tools/crop/CropRatioPicker.module.css";

export type CropRatioId =
  | "free"
  | "original"
  | "a4"
  | "letter"
  | "square"
  | "wide";

export const CROP_RATIO_IDS: CropRatioId[] = [
  "free",
  "original",
  "a4",
  "letter",
  "square",
  "wide",
];

/** Ratio presets follow the page's orientation, so A4 on a landscape page means landscape A4. */
export function ratioForPage(id: CropRatioId, page: PageSize): number | null {
  const landscape = page.width > page.height;
  const orient = (portrait: number) => (landscape ? 1 / portrait : portrait);
  switch (id) {
    case "original":
      return page.height === 0 ? null : page.width / page.height;
    case "a4":
      return orient(210 / 297);
    case "letter":
      return orient(8.5 / 11);
    case "square":
      return 1;
    case "wide":
      return 16 / 9;
    default:
      return null;
  }
}

interface CropRatioPickerProps {
  value: CropRatioId;
  onChange: (id: CropRatioId) => void;
  disabled?: boolean;
  /** One-row select for the tool panel; the editor keeps the chip grid. */
  compact?: boolean;
}

export default function CropRatioPicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: CropRatioPickerProps) {
  const { t } = useTranslation();
  const label = t("crop.ratio.title", "Aspect ratio");

  if (compact) {
    return (
      <Stack gap={4}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          {label}
        </Text>
        <Select
          options={CROP_RATIO_IDS.map((id) => ({
            value: id,
            label: t(`crop.ratio.${id}`, ratioLabel(id)),
          }))}
          value={value}
          onChange={(next) => {
            if (next && !disabled) onChange(next as CropRatioId);
          }}
          inputSize="sm"
          aria-label={label}
          disabled={disabled}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase">
        {label}
      </Text>
      <Group
        gap={4}
        wrap="wrap"
        role="group"
        aria-label={label}
        className={classes.grid}
      >
        {CROP_RATIO_IDS.map((id) => (
          <Chip
            key={id}
            data-testid={`crop-ratio-${id}`}
            size="xs"
            variant={value === id ? "primary" : "secondary"}
            accent={value === id ? "default" : "neutral"}
            onClick={disabled ? undefined : () => onChange(id)}
            aria-pressed={value === id}
            tabIndex={disabled ? -1 : 0}
          >
            {t(`crop.ratio.${id}`, ratioLabel(id))}
          </Chip>
        ))}
      </Group>
    </Stack>
  );
}

function ratioLabel(id: CropRatioId): string {
  switch (id) {
    case "free":
      return "Free";
    case "original":
      return "Original";
    case "a4":
      return "A4";
    case "letter":
      return "Letter";
    case "square":
      return "Square";
    case "wide":
      return "16:9";
  }
}
