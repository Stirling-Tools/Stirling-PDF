import { Tooltip, Popover, Stack, Text, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useState } from "react";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationPatch } from "@app/components/viewer/viewerTypes";
import { Icon } from "@app/ui/Icon";
import { ValueSlider } from "@app/components/annotation/shared/ValueSlider";
import { useStableHandler } from "@app/components/annotation/shared/useStableHandler";
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
  const updateFontSize = useStableHandler((val: number) =>
    onUpdate({ fontSize: val }),
  );
  const updateOpacity = useStableHandler((val: number) =>
    onUpdate({ opacity: val / 100 }),
  );
  const updateOpacityGroup = useStableHandler((val: number) => {
    const o = val / 100;
    onUpdate({ opacity: o, strokeOpacity: o, fillOpacity: o });
  });
  const updateStrokeWidth = useStableHandler((val: number) =>
    onUpdate({ borderWidth: val, strokeWidth: val, lineWidth: val }),
  );
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  interface AnnotationObjectProps {
    fontSize?: number;
    textAlign?: number | string;
    opacity?: number;
    borderWidth?: number;
    strokeWidth?: number;
  }

  const obj: (PdfAnnotationObject & AnnotationObjectProps) | undefined =
    annotation?.object;

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
        <ValueSlider
          value={fontSize}
          onChange={updateFontSize}
          min={8}
          max={32}
          suffix="pt"
        />
      </div>

      {/* Opacity */}
      <div>
        <Text size="xs" fw={500} mb={4}>
          {t("annotation.opacity", "Opacity")}
        </Text>
        <ValueSlider
          value={Math.round((obj?.opacity ?? 1) * 100)}
          onChange={updateOpacity}
          min={10}
          max={100}
          suffix="%"
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
            <Icon name="text-align-start" size={18} />
          </ActionIcon>
          <ActionIcon
            aria-label={t("annotation.alignCenter", "Align center")}
            variant={currentAlign === "center" ? "primary" : "secondary"}
            onClick={() => onUpdate({ textAlign: 1 })}
            size="md"
          >
            <Icon name="text-align-center" size={18} />
          </ActionIcon>
          <ActionIcon
            aria-label={t("annotation.alignRight", "Align right")}
            variant={currentAlign === "right" ? "primary" : "secondary"}
            onClick={() => onUpdate({ textAlign: 2 })}
            size="md"
          >
            <Icon name="text-align-end" size={18} />
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
        <ValueSlider
          value={opacity}
          onChange={updateOpacityGroup}
          min={10}
          max={100}
          suffix="%"
        />
      </div>

      {/* Stroke Width */}
      <div>
        <Group gap="xs" align="flex-end">
          <div style={{ flex: 1 }}>
            <Text size="xs" fw={500} mb={4}>
              {t("annotation.strokeWidth", "Stroke")}
            </Text>
            <ValueSlider
              value={strokeWidth}
              onChange={updateStrokeWidth}
              min={0}
              max={12}
              suffix="pt"
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
        <Tooltip label={t("annotation.properties", "Properties")} withArrow>
          <button
            type="button"
            className="embedpdf-floating-btn"
            onClick={() => setOpened(!opened)}
            disabled={disabled}
            aria-label={t("annotation.properties", "Properties")}
          >
            <Icon name="sliders-horizontal" size={18} />
          </button>
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
