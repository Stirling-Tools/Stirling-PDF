import {
  Box,
  Group,
  NumberInput,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import CropSquareOutlinedIcon from "@mui/icons-material/CropSquareOutlined";
import NumbersOutlinedIcon from "@mui/icons-material/NumbersOutlined";
import CropFreeOutlinedIcon from "@mui/icons-material/CropFreeOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import AdjustOutlinedIcon from "@mui/icons-material/AdjustOutlined";
import RadioButtonUncheckedOutlinedIcon from "@mui/icons-material/RadioButtonUncheckedOutlined";
import ArchitectureOutlinedIcon from "@mui/icons-material/ArchitectureOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { ActionIcon } from "@app/ui/ActionIcon";
import {
  ownAnnotationType,
  ownSegmentCount,
} from "@app/tools/takeoff/geometry";
import type {
  TakeoffAnnotation,
  TakeoffAnnotationType,
  TakeoffMaterial,
} from "@app/tools/takeoff/types";

interface TakeoffRowProps {
  material: TakeoffMaterial;
  materials: TakeoffMaterial[];
  annotations: TakeoffAnnotation[];
  armedTool: TakeoffAnnotationType | null;
  selected: boolean;
  onArmTool: (tool: TakeoffAnnotationType) => void;
  onChange: (patch: Partial<TakeoffMaterial>) => void;
  onRemove: () => void;
  onSelect: () => void;
}

const TOOL_BUTTONS: {
  tool: TakeoffAnnotationType;
  Icon: typeof StraightenOutlinedIcon;
}[] = [
  { tool: "length", Icon: StraightenOutlinedIcon },
  { tool: "area", Icon: CropSquareOutlinedIcon },
  { tool: "count", Icon: NumbersOutlinedIcon },
  { tool: "perimeter", Icon: CropFreeOutlinedIcon },
  { tool: "volume", Icon: ViewInArOutlinedIcon },
  { tool: "radius", Icon: AdjustOutlinedIcon },
  { tool: "diameter", Icon: RadioButtonUncheckedOutlinedIcon },
  { tool: "angle", Icon: ArchitectureOutlinedIcon },
];

export default function TakeoffRow({
  material,
  materials,
  annotations,
  armedTool,
  selected,
  onArmTool,
  onChange,
  onRemove,
  onSelect,
}: TakeoffRowProps) {
  const { t } = useTranslation();
  const ownType = ownAnnotationType(material.id, annotations);
  const lineTotal = (material.quantity ?? 0) * (material.unitPrice ?? 0);

  // Count's own quantity already reads as a segment count, so the hint is
  // only useful for length/area — where it confirms multiple segments
  // (possibly across pages) are summing into this row's total.
  const segmentCount = ownSegmentCount(material.id, annotations);
  const measuredAsLabel = ownType
    ? ownType !== "count" && segmentCount > 1
      ? t("takeoff.row.measuredAsSegments", "{{type}} · {{count}} segments", {
          type: t(`takeoff.row.measuredAs.${ownType}`, ownType),
          count: segmentCount,
        })
      : t(`takeoff.row.measuredAs.${ownType}`, ownType)
    : t("takeoff.row.notMeasured", "not measured");

  // Deducting only makes sense between two flat-area shapes (e.g. a window
  // opening netted out of a wall), so candidates are limited to other area
  // rows rather than every non-length/count row.
  const deductCandidates = materials.filter(
    (m) =>
      m.id !== material.id && ownAnnotationType(m.id, annotations) === "area",
  );

  return (
    <Box
      p="sm"
      onClick={onSelect}
      style={{
        borderBottom: "1px solid var(--c-border-subtle)",
        background: selected ? "var(--c-hover)" : undefined,
        cursor: "pointer",
      }}
    >
      <Group gap="xs" wrap="nowrap" mb={6}>
        <TextInput
          placeholder={t("takeoff.row.namePlaceholder", "Item name")}
          value={material.name}
          onChange={(e) => onChange({ name: e.currentTarget.value })}
          onClick={(e) => e.stopPropagation()}
          size="xs"
          style={{ flex: 1 }}
        />
        <ActionIcon
          variant="quiet"
          accent="danger"
          size="sm"
          aria-label={t("takeoff.row.remove", "Remove item")}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <DeleteOutlineOutlinedIcon fontSize="small" />
        </ActionIcon>
      </Group>

      <Group gap={4} mb={6} onClick={(e) => e.stopPropagation()}>
        {TOOL_BUTTONS.map(({ tool, Icon }) => (
          <ActionIcon
            key={tool}
            variant={armedTool === tool ? "primary" : "secondary"}
            size="sm"
            aria-label={t(`takeoff.row.tool.${tool}`, tool)}
            onClick={() => onArmTool(tool)}
          >
            <Icon fontSize="small" />
          </ActionIcon>
        ))}
        <Text size="xs" c="dimmed" ml={4}>
          {measuredAsLabel}
        </Text>
      </Group>

      <Group
        gap={6}
        mb={ownType === "area" || ownType === "volume" ? 6 : 0}
        onClick={(e) => e.stopPropagation()}
      >
        <TextInput
          placeholder={t("takeoff.row.unit", "unit")}
          value={material.unit}
          onChange={(e) => onChange({ unit: e.currentTarget.value })}
          size="xs"
          style={{ width: 64 }}
        />
        <NumberInput
          aria-label={t("takeoff.row.quantity", "Quantity")}
          value={material.quantity}
          onChange={(v) => onChange({ quantity: Number(v) || 0 })}
          size="xs"
          hideControls
          style={{ width: 72 }}
        />
        <Text size="xs" c="dimmed">
          &times;
        </Text>
        <NumberInput
          aria-label={t("takeoff.row.unitPrice", "Unit price")}
          value={material.unitPrice}
          onChange={(v) => onChange({ unitPrice: Number(v) || 0 })}
          size="xs"
          hideControls
          prefix="$"
          style={{ width: 84 }}
        />
        <Text size="xs" fw={600} ml="auto">
          $
          {lineTotal.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
      </Group>

      {ownType === "area" && (
        <Group gap={6} onClick={(e) => e.stopPropagation()}>
          <NumberInput
            aria-label={t("takeoff.row.pitch", "Roof pitch (degrees)")}
            placeholder={t("takeoff.row.pitchPlaceholder", "pitch°")}
            value={material.pitchDegrees ?? ""}
            onChange={(v) =>
              onChange({ pitchDegrees: v === "" ? undefined : Number(v) })
            }
            size="xs"
            hideControls
            min={0}
            max={89}
            style={{ width: 84 }}
          />
          <Select
            aria-label={t("takeoff.row.deductsFrom", "Deduct from")}
            placeholder={t(
              "takeoff.row.deductsFromPlaceholder",
              "Deduct from…",
            )}
            data={deductCandidates.map((m) => ({
              value: m.id,
              label: m.name || t("takeoff.row.unnamed", "Unnamed item"),
            }))}
            value={material.deductsFromMaterialId ?? null}
            onChange={(v) =>
              onChange({ deductsFromMaterialId: v ?? undefined })
            }
            size="xs"
            clearable
            style={{ flex: 1 }}
          />
        </Group>
      )}

      {ownType === "volume" && (
        <Group gap={6} onClick={(e) => e.stopPropagation()}>
          <NumberInput
            aria-label={t("takeoff.row.depth", "Depth/height")}
            placeholder={t("takeoff.row.depthPlaceholder", "depth")}
            value={material.depthValue ?? ""}
            onChange={(v) =>
              onChange({ depthValue: v === "" ? undefined : Number(v) })
            }
            size="xs"
            hideControls
            min={0}
            style={{ width: 84 }}
          />
        </Group>
      )}
    </Box>
  );
}
