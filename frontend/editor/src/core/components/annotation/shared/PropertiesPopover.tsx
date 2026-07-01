import { Tooltip, Popover, Stack, Slider, Text, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/Button";
import { ActionIcon } from "@shared/components/ActionIcon";
import { useState } from "react";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationPatch } from "@app/components/viewer/viewerTypes";
import TuneIcon from "@mui/icons-material/Tune";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";

export type PropertiesAnnotationType = "text" | "note" | "shape";

interface PropertiesPopoverProps {
  annotationType: PropertiesAnnotationType;
  annotation: TrackedAnnotation<PdfAnnotationObject> | undefined;
  onUpdate: (patch: AnnotationPatch) => void;
  disabled?: boolean;
}

export function PropertiesPopover({
  annotationType,
  annotation,
  onUpdate,
  disabled = false,
}: PropertiesPopoverProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  interface AnnotationObjectProps {
    fontSize?: number;
    textAlign?: number | string;
    opacity?: number;
    borderWidth?: number;
    strokeWidth?: number;
  }

  const obj = annotation?.object as
    | (PdfAnnotationObject & AnnotationObjectProps)
    | undefined;

  // Get current values
  const fontSize = obj?.fontSize ?? 14;
  const textAlign = obj?.textAlign;
  const currentAlign =
    typeof textAlign === "number"
      ? textAlign === 1
        ? "center"
        : textAlign === 2
          ? "right"
          : "left"
      : textAlign === "center"
        ? "center"
        : textAlign === "right"
          ? "right"
          : "left";

  // For shapes
  const opacity = Math.round((obj?.opacity ?? 1) * 100);
  const strokeWidth = obj?.borderWidth ?? obj?.strokeWidth ?? 2;
  const borderVisible = strokeWidth > 0;

  const renderTextNoteControls = () => (
    <Stack gap="md" style={{ minWidth: 280 }}>
      {/* Font Size */}
      <div>
        <Text size="xs" fw={500} mb={4}>
          {t("annotation.fontSize", "Font size")}
        </Text>
        <Slider
          value={fontSize}
          onChange={(val) => onUpdate({ fontSize: val })}
          min={8}
          max={32}
          label={(val) => `${val}pt`}
        />
      </div>

      {/* Opacity */}
      <div>
        <Text size="xs" fw={500} mb={4}>
          {t("annotation.opacity", "Opacity")}
        </Text>
        <Slider
          value={Math.round((obj?.opacity ?? 1) * 100)}
          onChange={(val) => onUpdate({ opacity: val / 100 })}
          min={10}
          max={100}
          label={(val) => `${val}%`}
        />
      </div>

      {/* Text Alignment */}
      <div>
        <Text size="xs" fw={500} mb={4}>
          {t("annotation.textAlignment", "Text Alignment")}
        </Text>
        <Group gap="xs">
          <ActionIcon
            aria-label={t("annotation.alignLeft", "Align left")}
            variant={currentAlign === "left" ? "primary" : "secondary"}
            onClick={() => onUpdate({ textAlign: 0 })}
            size="md"
          >
            <FormatAlignLeftIcon style={{ fontSize: 18 }} />
          </ActionIcon>
          <ActionIcon
            aria-label={t("annotation.alignCenter", "Align center")}
            variant={currentAlign === "center" ? "primary" : "secondary"}
            onClick={() => onUpdate({ textAlign: 1 })}
            size="md"
          >
            <FormatAlignCenterIcon style={{ fontSize: 18 }} />
          </ActionIcon>
          <ActionIcon
            aria-label={t("annotation.alignRight", "Align right")}
            variant={currentAlign === "right" ? "primary" : "secondary"}
            onClick={() => onUpdate({ textAlign: 2 })}
            size="md"
          >
            <FormatAlignRightIcon style={{ fontSize: 18 }} />
          </ActionIcon>
        </Group>
      </div>
    </Stack>
  );

  const renderShapeControls = () => (
    <Stack gap="md" style={{ minWidth: 250 }}>
      {/* Opacity */}
      <div>
        <Text size="xs" fw={500} mb={4}>
          {t("annotation.opacity", "Opacity")}
        </Text>
        <Slider
          value={opacity}
          onChange={(val) => {
            const newOpacity = val / 100;
            onUpdate({
              opacity: newOpacity,
              strokeOpacity: newOpacity,
              fillOpacity: newOpacity,
            });
          }}
          min={10}
          max={100}
          label={(val) => `${val}%`}
        />
      </div>

      {/* Stroke Width */}
      <div>
        <Group gap="xs" align="flex-end">
          <div style={{ flex: 1 }}>
            <Text size="xs" fw={500} mb={4}>
              {t("annotation.strokeWidth", "Stroke")}
            </Text>
            <Slider
              value={strokeWidth}
              onChange={(val) => {
                onUpdate({
                  borderWidth: val,
                  strokeWidth: val,
                  lineWidth: val,
                });
              }}
              min={0}
              max={12}
              label={(val) => `${val}pt`}
            />
          </div>
          <Button
            size="sm"
            variant={!borderVisible ? "primary" : "secondary"}
            onClick={() => {
              const newValue = borderVisible ? 0 : 1;
              onUpdate({
                borderWidth: newValue,
                strokeWidth: newValue,
                lineWidth: newValue,
              });
            }}
          >
            {borderVisible
              ? t("annotation.borderOn", "Border: On")
              : t("annotation.borderOff", "Border: Off")}
          </Button>
        </Group>
      </div>
    </Stack>
  );

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom" withArrow>
      <Popover.Target>
        <Tooltip label={t("annotation.properties", "Properties")}>
          <ActionIcon
            aria-label={t("annotation.properties", "Properties")}
            variant="secondary"
            accent="neutral"
            size="md"
            onClick={() => setOpened(!opened)}
            disabled={disabled}
          >
            <TuneIcon style={{ fontSize: 18 }} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        {(annotationType === "text" || annotationType === "note") &&
          renderTextNoteControls()}
        {annotationType === "shape" && renderShapeControls()}
      </Popover.Dropdown>
    </Popover>
  );
}
