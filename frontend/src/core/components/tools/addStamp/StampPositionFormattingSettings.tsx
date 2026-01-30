import { useTranslation } from "react-i18next";
import { Group, Select, Stack, ColorInput, Button, Slider, Text, NumberInput } from "@mantine/core";
import { AddStampParameters } from "@app/components/tools/addStamp/useAddStampParameters";
import LocalIcon from "@app/components/shared/LocalIcon";
import styles from "@app/components/tools/addStamp/StampPreview.module.css";
import { Tooltip } from "@app/components/shared/Tooltip";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface StampPositionFormattingSettingsProps {
  parameters: AddStampParameters;
  onParameterChange: <K extends keyof AddStampParameters>(key: K, value: AddStampParameters[K]) => void;
  disabled?: boolean;
  showPositionGrid?: boolean; // When true, show the 9-position grid for automation
}

const StampPositionFormattingSettings = ({ parameters, onParameterChange, disabled = false, showPositionGrid = false }: StampPositionFormattingSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md" justify="space-between">
      {/* Position Grid - shown in automation settings */}
      {showPositionGrid && (
        <Stack gap="xs">
          <Text size="sm" fw={500}>{t('AddStampRequest.position', 'Stamp Position')}</Text>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            maxWidth: '200px'
          }}>
            {Array.from({ length: 9 }).map((_, i) => {
              const idx = (i + 1) as 1|2|3|4|5|6|7|8|9;
              const selected = parameters.position === idx;
              return (
                <Button
                  key={idx}
                  variant={selected ? 'filled' : 'outline'}
                  onClick={() => {
                    onParameterChange('position', idx);
                    // Ensure we're using grid positioning, not custom overrides
                    onParameterChange('overrideX', -1 as any);
                    onParameterChange('overrideY', -1 as any);
                  }}
                  disabled={disabled}
                  styles={{
                    root: {
                      height: '50px',
                      padding: '0',
                    }
                  }}
                >
                  {idx}
                </Button>
              );
            })}
          </div>
        </Stack>
      )}
      {/* Icon pill buttons row */}
      <div className="flex justify-between gap-[0.5rem]">
        <Tooltip content={t('AddStampRequest.rotation', 'Rotation')} position="top">
          <Button
            variant={parameters._activePill === 'rotation' ? 'filled' : 'outline'}
            className="flex-1"
            onClick={() => onParameterChange('_activePill', 'rotation')}
          >
            <LocalIcon icon="rotate-right-rounded" width="1.1rem" height="1.1rem" />
          </Button>
        </Tooltip>
        <Tooltip content={t('AddStampRequest.opacity', 'Opacity')} position="top">
          <Button
            variant={parameters._activePill === 'opacity' ? 'filled' : 'outline'}
            className="flex-1"
            onClick={() => onParameterChange('_activePill', 'opacity')}
          >
            <LocalIcon icon="opacity" width="1.1rem" height="1.1rem" />
          </Button>
        </Tooltip>
        <Tooltip content={parameters.stampType === 'image' ? t('AddStampRequest.imageSize', 'Image Size') : t('AddStampRequest.fontSize', 'Font Size')} position="top">
          <Button
            variant={parameters._activePill === 'fontSize' ? 'filled' : 'outline'}
            className="flex-1"
            onClick={() => onParameterChange('_activePill', 'fontSize')}
          >
            <LocalIcon icon="zoom-in-map-rounded" width="1.1rem" height="1.1rem" />
          </Button>
        </Tooltip>
      </div>

      {/* Single slider bound to selected pill */}
      {parameters._activePill === 'fontSize' && (
        <Stack gap="xs">
          <Text className={styles.labelText}>
            {parameters.stampType === 'image'
              ? t('AddStampRequest.imageSize', 'Image Size')
              : t('AddStampRequest.fontSize', 'Font Size')
            }
          </Text>
          <Group className={styles.sliderGroup} align="center">
            <NumberInput
              value={parameters.fontSize}
              onChange={(v) => onParameterChange('fontSize', typeof v === 'number' && v > 0 ? v : 1)}
              min={1}
              max={400}
              step={1}
              size="sm"
              className={styles.numberInput}
              disabled={disabled}
            />
            <Slider
              value={parameters.fontSize}
              onChange={(v) => onParameterChange('fontSize', v as number)}
              min={1}
              max={400}
              step={1}
              className={styles.slider}
              disabled={disabled}
            />
          </Group>
        </Stack>
      )}
      {parameters._activePill === 'rotation' && (
        <Stack gap="xs">
          <Text className={styles.labelText}>{t('AddStampRequest.rotation', 'Rotation')}</Text>
          <Group className={styles.sliderGroup} align="center">
            <NumberInput
              value={parameters.rotation}
              onChange={(v) => onParameterChange('rotation', typeof v === 'number' ? v : 0)}
              min={-180}
              max={180}
              step={1}
              size="sm"
              className={styles.numberInput}
              hideControls
              disabled={disabled}
            />
            <Slider
              value={parameters.rotation}
              onChange={(v) => onParameterChange('rotation', v as number)}
              min={-180}
              max={180}
              step={1}
              className={styles.sliderWide}
            />
          </Group>
        </Stack>
      )}
      {parameters._activePill === 'opacity' && (
        <Stack gap="xs">
          <Text className={styles.labelText}>{t('AddStampRequest.opacity', 'Opacity')}</Text>
          <Group className={styles.sliderGroup} align="center">
            <NumberInput
              value={parameters.opacity}
              onChange={(v) => onParameterChange('opacity', typeof v === 'number' ? v : 0)}
              min={0}
              max={100}
              step={1}
              size="sm"
              className={styles.numberInput}
              disabled={disabled}
            />
            <Slider
              value={parameters.opacity}
              onChange={(v) => onParameterChange('opacity', v as number)}
              min={0}
              max={100}
              step={1}
              className={styles.slider}
            />
          </Group>
        </Stack>
      )}

      {parameters.stampType !== 'image' && (
        <ColorInput
          label={t('AddStampRequest.customColor', 'Custom Text Color')}
          value={parameters.customColor}
          onChange={(value) => onParameterChange('customColor', value)}
          format="hex"
          disabled={disabled}
          popoverProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
        />
      )}

      {/* Margin selection for text stamps */}
      {parameters.stampType === 'text' && (
        <Select
          label={t('AddStampRequest.margin', 'Margin')}
          value={parameters.customMargin}
          onChange={(v) => onParameterChange('customMargin', (v as any) || 'medium')}
          data={[
            { value: 'small', label: t('margin.small', 'Small') },
            { value: 'medium', label: t('margin.medium', 'Medium') },
            { value: 'large', label: t('margin.large', 'Large') },
            { value: 'x-large', label: t('margin.xLarge', 'Extra Large') },
          ]}
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
        />
      )}
    </Stack>
  );
};

export default StampPositionFormattingSettings;
